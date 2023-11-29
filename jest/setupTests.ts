const { error } = console;
console.error = function wrappedError(...args) {
  error.apply(console, args);
  throw new Error('Tests produced errors, see console log');
};

// eslint-disable-next-line no-console
console.log = jest.fn();
console.info = jest.fn();
console.warn = jest.fn();
