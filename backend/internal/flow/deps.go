package flow

import (
	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/indexer"
	"github.com/gagliardetto/solana-go"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Deps struct {
	Pool     *pgxpool.Pool
	Addr     cluster.Addresses
	Indexer  *indexer.Client
	Keeper   solana.PrivateKey
	GMGN     *gmgn.Client
	OnIngest func()
}
