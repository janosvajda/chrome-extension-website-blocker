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
    preset: 'ts-jest',
    transform: {
        '^.+\\.(ts|tsx)?$': 'ts-jest',
        '^.+\\.(js|jsx)$': 'babel-jest',
    },
    verbose: true,
};

