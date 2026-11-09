const {defineConfig}=require('eslint/config');
const expo=require('eslint-config-expo/flat');
module.exports=defineConfig([expo,{ignores:['node_modules/**','.expo/**','dist/**']},{rules:{'react-hooks/set-state-in-effect':'off','react-hooks/refs':'off','react-hooks/purity':'off','react-hooks/error-boundaries':'off'}}]);
