package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/signing"
	"github.com/1vault/backend/internal/txconfirm"
	"github.com/1vault/backend/internal/txprep"
	"github.com/gagliardetto/solana-go"
)

func (a *API) clusterAddrs(clusterName string) cluster.Addresses {
	c := cluster.Cluster(clusterName)
	if clusterName == "" {
		c = cluster.Cluster(a.Cfg.DefaultCluster)
	}
	return cluster.AddressesFor(c, a.Cfg.DevnetRPCURL, a.Cfg.MainnetRPCURL)
}

func (a *API) txConfirmOpts() txconfirm.Options {
	return a.txConfirmOptsFor(a.Cfg.DefaultCluster)
}

func (a *API) txConfirmOptsFor(clusterName string) txconfirm.Options {
	auto := a.Indexer != nil && a.Indexer.Enabled()
	return txconfirm.Options{
		RPCURL:     a.clusterAddrs(clusterName).RPCURL,
		Indexer:    a.Indexer,
		AutoIngest: auto,
		OnConfirmed: func(_ string, _ txconfirm.IngestInfo) {
			a.bustProductCache()
		},
	}
}

func (a *API) txConfirmOptsFromRequest(r *http.Request) txconfirm.Options {
	return a.txConfirmOptsFor(string(httpx.ClusterFrom(r)))
}

func (a *API) bustProductCache() {
	if a.DBCache != nil {
		a.DBCache.InvalidatePrefix("vaults:")
		a.DBCache.InvalidatePrefix("vault:")
		a.DBCache.InvalidatePrefix("leaderboard:")
		a.DBCache.InvalidatePrefix("trades:")
		a.DBCache.InvalidatePrefix("strategist:")
		a.DBCache.InvalidatePrefix("investor:")
	}
	if a.VaultIndex != nil {
		go func() { _ = a.VaultIndex.Refresh(context.Background()) }()
	}
}

func (a *API) finalizeAndSend(r *http.Request, signedB64 string, details []signing.Detail, serverKeys map[string]solana.PrivateKey, autoIngest bool) (string, error) {
	raw, err := txprep.DecodeSignedTx(signedB64)
	if err != nil {
		return "", err
	}
	if len(details) > 0 {
		raw, err = signing.MergePartial(raw, details, serverKeys)
		if err != nil {
			return "", err
		}
	}
	rpc := txprep.NewRPC(a.addresses(r).RPCURL)
	sig, err := rpc.SendRaw(raw)
	if err != nil {
		return "", err
	}
	opt := a.txConfirmOptsFromRequest(r)
	opt.AutoIngest = autoIngest && opt.AutoIngest
	txconfirm.RunAsync(sig, opt)
	return sig, nil
}

func isMissingEOA(err error) bool {
	return errors.Is(err, signing.ErrMissingEOASignature)
}
