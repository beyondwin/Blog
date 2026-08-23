import { compile, run } from '@mdx-js/mdx';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { createTrustedMdxComponents, type TrustedMdxComponentOptions } from './components';

interface MdxNode {
  type?: string;
  name?: string | null;
  attributes?: Array<{
    type?: string;
    name?: string;
    value?: unknown;
  }>;
  children?: MdxNode[];
}

const allowedAttributes = {
  Figure: new Set(['media']),
  Callout: new Set(['title']),
} as const;

function trustedMdxError(message: string): Error {
  return new Error(`trusted MDX rejected: ${message}`);
}

function validateNode(node: MdxNode): void {
  if (node.type === 'mdxjsEsm') throw trustedMdxError('imports and exports are forbidden');
  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    throw trustedMdxError('JavaScript expressions are forbidden');
  }

  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    if (node.name !== 'Figure' && node.name !== 'Callout') {
      throw trustedMdxError(`unknown JSX component or element ${node.name ?? '<fragment>'}`);
    }
    const attributes = node.attributes ?? [];
    const seen = new Set<string>();
    for (const attribute of attributes) {
      if (attribute.type !== 'mdxJsxAttribute' || !attribute.name) {
        throw trustedMdxError(`${node.name} attribute spreads are forbidden`);
      }
      if (!allowedAttributes[node.name].has(attribute.name)) {
        throw trustedMdxError(`${node.name}.${attribute.name} is not allowlisted`);
      }
      if (typeof attribute.value !== 'string') {
        throw trustedMdxError(`${node.name}.${attribute.name} must be a string literal`);
      }
      if (seen.has(attribute.name)) throw trustedMdxError(`${node.name}.${attribute.name} is duplicated`);
      seen.add(attribute.name);
    }
    if (node.name === 'Figure') {
      if (!seen.has('media')) throw trustedMdxError('Figure.media is required');
      if ((node.children ?? []).length > 0) throw trustedMdxError('Figure cannot contain children');
    }
  }

  for (const child of node.children ?? []) validateNode(child);
}

function validateTrustedMdx() {
  return (tree: MdxNode) => validateNode(tree);
}

export async function renderTrustedMdx(
  source: string,
  options: TrustedMdxComponentOptions,
): Promise<string> {
  const compiled = await compile(source, {
    outputFormat: 'function-body',
    remarkPlugins: [remarkGfm, validateTrustedMdx],
    rehypePlugins: [rehypeSlug],
  });
  const module = await run(String(compiled), {
    ...jsxRuntime,
    baseUrl: import.meta.url,
  });
  const Content = module.default;
  return renderToStaticMarkup(<Content components={createTrustedMdxComponents(options)} />)
    .replaceAll(' srcSet="', ' srcset="');
}
