// scripts/mock-server-only.js
// Mock 'server-only' package so standalone test scripts can import modules that declare import 'server-only'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'
const Module = require('module')
const originalRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === 'server-only') {
    return {}
  }
  return originalRequire.apply(this, arguments)
}
