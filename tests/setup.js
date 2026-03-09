// Setup file pour Jest

// Supprimer les avertissements console dans les tests
const originalWarn = console.warn;
console.warn = (...args) => {
  // Filtrer les avertissements Jest
  if (args[0] && args[0].includes && args[0].includes('Warning:')) {
    return;
  }
  originalWarn.apply(console, args);
};

// Configurer le timeout global
jest.setTimeout(10000);

// Setup avant chaque test
beforeEach(async () => {
  // Reset des mocks
  jest.clearAllMocks();
});

// Cleanup après chaque test
afterEach(async () => {
  // Cleanup si nécessaire
});
