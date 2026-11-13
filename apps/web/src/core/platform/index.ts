// Public entry point of the platform abstraction layer.
//
// Feature code imports from `core/platform` only, never from the individual
// modules: when the app is wrapped with Capacitor (T050) the implementations
// change but these names stay the same.

export * from './notify'
export * from './share'
export * from './storage'
