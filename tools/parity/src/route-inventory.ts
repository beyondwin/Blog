import { readAstroHtmlContracts } from './html-contract';

export interface PublicRouteInventory {
  routes: string[];
}

export async function buildPublicRouteInventory(root: string): Promise<PublicRouteInventory> {
  const contracts = await readAstroHtmlContracts(root);
  return { routes: contracts.map((contract) => contract.path) };
}
