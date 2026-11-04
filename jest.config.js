module.exports = {
    automock: false,
    modulePathIgnorePatterns: ['<rootDir>/built', '<rootDir>/.*/__mocks__'],
    bail: false,
    collectCoverageFrom: ['src/**/*.{js,ts}', '!**/node_modules/**'],
    coverageDirectory: '<rootDir>/reports/coverage',
    coverageThreshold: {
        global: {
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
        },
        './src/background.ts': {
            statements: 90,
            branches: 90,
            functions: 90,
            lines: 90,
        },
    },
    coveragePathIgnorePatterns: ['node_modules', '<rootDir>/src/main\\.ts$', '\\.d\\.ts$', '\\.module\\.ts$'],
    moduleFileExtensions: ['ts', 'js', 'json', 'jsx', 'node'],
    roots: ['<rootDir>/src'],
    testEnvironment: 'node',
    testRegex: '(test|spec)\\.ts?$',
    transform: {
        '^.+\\.(ts|tsx)$': ['@swc/jest', {
            jsc: {
                parser: { syntax: 'typescript' },
                target: 'es2022',
            },
            module: { type: 'commonjs' },
        }],
    },
    verbose: true,
};
