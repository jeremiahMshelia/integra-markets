import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const AssetRegistry = require('react-native/Libraries/Image/AssetRegistry');

export default AssetRegistry;

// Support CommonJS consumers (e.g. Metro)
if (typeof module !== 'undefined') {
  module.exports = AssetRegistry;
}
