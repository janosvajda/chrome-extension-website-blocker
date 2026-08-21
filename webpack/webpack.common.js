const webpack = require("webpack");
const path = require("path");
const dotenv = require("dotenv");
const CopyPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "..", "src");
const srcUIDir = path.join(__dirname, "..", "src/ui");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const passwordStorageKey = (process.env.PASSWORD_STORAGE_KEY || "").trim();
const passwordSaltStorageKey = (process.env.PASSWORD_SALT_STORAGE_KEY || "").trim();

if (!passwordStorageKey || !passwordSaltStorageKey) {
    throw new Error(
        "Missing required .env keys: PASSWORD_STORAGE_KEY and PASSWORD_SALT_STORAGE_KEY must be set."
    );
}

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
        new webpack.DefinePlugin({
            __TINY_BLOCKER_PASSWORD_STORAGE_KEY__: JSON.stringify(passwordStorageKey),
            __TINY_BLOCKER_PASSWORD_SALT_STORAGE_KEY__: JSON.stringify(passwordSaltStorageKey),
        }),
    ],
};
