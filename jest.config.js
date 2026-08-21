module.exports = {
    automock: false,
    modulePathIgnorePatterns: ['<rootDir>/built', '<rootDir>/.*/__mocks__'],
    bail: false,
    collectCoverageFrom: ['src/**/*.{js,ts}', '!**/node_modules/**'],
    coverageDirectory: '<rootDir>/reports/coverage',
    coveragePathIgnorePatterns: ['node_modules', '<rootDir>/src/main.ts', '.d.ts', '.module.ts'],
    moduleFileExtensions: ['ts', 'js', 'json', 'jsx', 'node'],
    moduleNameMapper: {
        '@src/(.*)': '<rootDir>/src/$1',
        '@constants/(.*)': '<rootDir>/src/constants/$1',
        '@interfaces/(.*)': '<rootDir>/src/interfaces/$1',
        '@utils/(.*)': '<rootDir>/src/utils/$1',
    },
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
