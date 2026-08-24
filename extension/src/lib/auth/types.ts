export type AuthUser = {
  id: string;
  twitterId: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  wallets?: Array<{
    pubkey: string;
    rolePreference?: string;
    isPrimary?: boolean;
  }>;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user?: AuthUser;
};
