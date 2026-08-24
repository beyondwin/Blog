import {
  canonicalJson,
  readActiveRelease,
  type VerifiedActivePublicRelease,
} from '@beyondwin/content/release';

export const PUBLIC_RELEASE_BINDING_ENV = 'BEYONDWIN_PUBLIC_RELEASE_BINDING_V1';

export interface PublicReleaseBuildBinding {
  version: 1;
  verificationPolicyVersion: number;
  releaseId: string;
  rendererVersion: string;
  pointer: { releaseId: string; path: string };
  activePointerHash: string;
  manifestHash: string;
  artifactHash: string;
}

const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const releaseIdPattern = /^[a-f0-9]{64}$/u;

export function releaseBindingFor(active: VerifiedActivePublicRelease): PublicReleaseBuildBinding {
  return {
    version: 1,
    verificationPolicyVersion: active.verificationPolicyVersion,
    releaseId: active.manifest.releaseId,
    rendererVersion: active.manifest.rendererVersion,
    pointer: active.pointer,
    activePointerHash: active.activePointerHash,
    manifestHash: active.manifestHash,
    artifactHash: active.artifactHash,
  };
}

export function serializeReleaseBinding(active: VerifiedActivePublicRelease): string {
  return canonicalJson(releaseBindingFor(active));
}

function parseReleaseBinding(input: string | undefined): PublicReleaseBuildBinding {
  if (!input) throw new Error(`${PUBLIC_RELEASE_BINDING_ENV} is required for a verified React Router build`);
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (error) {
    throw new Error('Invalid bound public release JSON', { cause: error });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid bound public release evidence');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const expectedKeys = [
    'activePointerHash',
    'artifactHash',
    'manifestHash',
    'pointer',
    'releaseId',
    'rendererVersion',
    'verificationPolicyVersion',
    'version',
  ].sort();
  const pointer = candidate.pointer;
  if (canonicalJson(keys) !== canonicalJson(expectedKeys)
    || candidate.version !== 1
    || !Number.isInteger(candidate.verificationPolicyVersion)
    || typeof candidate.releaseId !== 'string'
    || !releaseIdPattern.test(candidate.releaseId)
    || typeof candidate.rendererVersion !== 'string'
    || !pointer
    || typeof pointer !== 'object'
    || Array.isArray(pointer)) {
    throw new Error('Invalid bound public release evidence');
  }
  const pointerRecord = pointer as Record<string, unknown>;
  if (canonicalJson(Object.keys(pointerRecord).sort()) !== canonicalJson(['path', 'releaseId'])
    || pointerRecord.releaseId !== candidate.releaseId
    || pointerRecord.path !== candidate.releaseId
    || !['activePointerHash', 'manifestHash', 'artifactHash'].every((key) => (
      typeof candidate[key] === 'string' && hashPattern.test(candidate[key])
    ))) {
    throw new Error('Invalid bound public release evidence');
  }
  return candidate as unknown as PublicReleaseBuildBinding;
}

export async function readBoundActiveRelease(
  releasesRoot: string,
  bindingInput: string | undefined,
): Promise<VerifiedActivePublicRelease> {
  const binding = parseReleaseBinding(bindingInput);
  const active = await readActiveRelease(releasesRoot);
  if (canonicalJson(releaseBindingFor(active)) !== canonicalJson(binding)) {
    throw new Error('Bound public release changed: release evidence mismatch');
  }
  return active;
}
