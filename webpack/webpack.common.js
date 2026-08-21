const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "..", "src");

module.exports = {
    entry: {
        options: path.join(srcDir, 'options.ts'),
        background: path.join(srcDir, 'background.ts'),
        content: path.join(srcDir, 'content.ts'),
        popup: path.join(srcDir, 'popup.ts'),
    },
    output: {
        path: path.join(__dirname, "../built"),
        filename: "[name].js",
    },
    optimization: {
        splitChunks: {
            name: "vendor",
            chunks(chunk) {
                return chunk.name !== 'background';
            }
        },
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: {
                    loader: "swc-loader",
                    options: {
                        jsc: {
                            parser: { syntax: "typescript" },
                            target: "es2022",
                        },
                    },
                },
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: [".ts",".js"],
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: "src/ui", to: "../built", context: "" }],
            options: {},
        }),
    ],
};
