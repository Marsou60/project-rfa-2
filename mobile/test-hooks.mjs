import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  const local = specifier.startsWith('./') || specifier.startsWith('../');
  if (local && !path.extname(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
