"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const loader_utils_1 = require("loader-utils");
const twing_1 = require("twing");
const visitor_1 = require("./visitor");
const sha256 = require('crypto-js/sha256');
const hex = require('crypto-js/enc-hex');
const slash = require('slash');
const path = require('path');
const validateOptions = require('schema-utils');
const optionsSchema = {
    type: 'object',
    properties: {
        environmentModulePath: {
            type: 'string'
        },
        renderContext: {
            type: 'object'
        },
        withHTMLComments: {
            type: 'boolean'
        }
    },
    required: [
        'environmentModulePath'
    ],
    additionalProperties: false
};
class PathSupportingArrayLoader extends twing_1.TwingLoaderArray {
    getSourceContext(name, from) {
        return super.getSourceContext(name, from).then((source) => {
            return new twing_1.TwingSource(source.getCode(), source.getName(), name);
        });
    }
}
function default_1(source) {
    const callback = this.async();
    const getTemplateHash = (name) => {
        return this.mode !== 'production' ? name : hex.stringify(sha256(name));
    };
    const options = loader_utils_1.getOptions(this);
    validateOptions(optionsSchema, options, 'Twing loader');
    delete require.cache[options.environmentModulePath];
    let resourcePath = slash(this.resourcePath);
    let environmentModulePath = options.environmentModulePath;
    let renderContext = options.renderContext;
    let withHTMLComments = options.withHTMLComments;
    if (withHTMLComments) {
        const relativePath = path.relative(process.cwd(), resourcePath);
        source = `<!-- START: ${relativePath} -->\n${source || ''}\n<!-- END: ${relativePath} -->`;
    }
    this.addDependency(slash(environmentModulePath));
    // require takes module name separated with forward slashes
    let environment = require(slash(environmentModulePath));
    let loader = environment.getLoader();
    if (renderContext === undefined) {
        let parts = [
            `const env = require('${slash(environmentModulePath)}');`
        ];
        let key = getTemplateHash(resourcePath);
        let sourceContext = new twing_1.TwingSource(source, `${key}`);
        let tokenStream = environment.tokenize(sourceContext);
        let module = environment.parse(tokenStream);
        let visitor = new visitor_1.Visitor(loader, resourcePath, getTemplateHash);
        visitor.visit(module).then(() => {
            let precompiledTemplate = environment.compile(module);
            parts.push(`let templatesModule = (() => {
let module = {
    exports: undefined
};

${precompiledTemplate}

    return module.exports;
})();
`);
            for (let foundTemplateName of visitor.foundTemplateNames) {
                // require takes module name separated with forward slashes
                parts.push(`require('${slash(foundTemplateName)}');`);
            }
            parts.push(`env.registerTemplatesModule(templatesModule, '${key}');`);
            parts.push(`
let template = env.loadTemplate('${key}');

module.exports = (context = {}) => {
    return template.then((template) => template.render(context));
};`);
            callback(null, parts.join('\n'));
        });
    }
    else {
        environment.setLoader(new twing_1.TwingLoaderChain([
            new PathSupportingArrayLoader(new Map([
                [resourcePath, source]
            ])),
            loader
        ]));
        environment.on('template', async (name, from) => {
            this.addDependency(await environment.getLoader().resolve(name, from));
        });
        environment.render(resourcePath, renderContext).then((result) => {
            callback(null, `module.exports = ${JSON.stringify(result)};`);
        }).catch((error) => {
            callback(error);
        });
    }
}
exports.default = default_1;
;
