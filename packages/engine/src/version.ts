/**
 * The engine's version, the same as its package version (a test keeps them equal). Stored with each
 * break snapshot in HQ, so a reader such as FirstPass Studio can tell when a snapshot's state was made by
 * a different major version of the engine and should fold the events again instead.
 */
export const ENGINE_VERSION = '0.1.0';
