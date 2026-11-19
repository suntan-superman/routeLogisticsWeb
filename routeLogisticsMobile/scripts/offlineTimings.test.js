const { test } = require('node:test'), assert = require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), babel=require('@babel/core');
function load(){const file=path.resolve(__dirname,'../services/offlineTimings.js'),module={exports:{}};const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,configFile:false,babelrc:false,presets:[[require.resolve('babel-preset-expo'),{jsxRuntime:'classic'}]],plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;new Function('require','module','exports',code)(require,module,module.exports);return module.exports;}
test('offline timing instrumentation is bounded and contains no record identifiers or payloads',()=>{
 const timings=load();timings.resetOfflineTimings();for(let index=0;index<130;index++)timings.recordOfflineTiming(index%2?'photo':'arrival','sync',Date.now()-index,index%7?'ok':'failed');
 const rows=timings.readOfflineTimings();assert.equal(rows.length,100);for(const row of rows){assert.deepEqual(Object.keys(row).sort(),['at','durationMs','kind','phase','result']);assert.ok(row.durationMs>=0);assert.ok(['photo','arrival'].includes(row.kind));}
});
