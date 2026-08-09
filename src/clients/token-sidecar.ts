export interface TokenSidecar {
  refreshToken: string;
  realmId?: string;
  descendedFrom: string;
  updatedAt: string;
}

export interface ResolvedTokens {
  refreshToken: string | undefined;
  realmId: string | undefined;
  chainRoot: string | undefined;
}

// Implements the "descended from" chain-trust rule from the #117 design:
// a sidecar is only trusted while its chain root still matches the token
// the host config currently supplies. If an operator pastes a new token
// into their host config (manual re-auth), the chain resets and the
// configured value wins — a stale sidecar can never silently override that.
export function resolveRefreshToken(
  configuredToken: string | undefined,
  configuredRealmId: string | undefined,
  sidecar: TokenSidecar | null
): ResolvedTokens {
  if (sidecar && configuredToken && sidecar.descendedFrom === configuredToken) {
    return {
      refreshToken: sidecar.refreshToken,
      realmId: sidecar.realmId ?? configuredRealmId,
      chainRoot: sidecar.descendedFrom,
    };
  }
  return {
    refreshToken: configuredToken,
    realmId: configuredRealmId,
    chainRoot: configuredToken,
  };
}
