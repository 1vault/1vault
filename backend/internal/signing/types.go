package signing

type SignerKind string

const (
	KindEOA       SignerKind = "eoa"
	KindEphemeral SignerKind = "ephemeral"
	KindKeeper    SignerKind = "keeper"
)

type Detail struct {
	Pubkey       string     `json:"pubkey"`
	SignerKind   SignerKind `json:"signerKind"`
	UserMustSign bool       `json:"userMustSign"`
}

type Mode string

const (
	ModeFull    Mode = "full"
	ModePartial Mode = "partial"
	ModeServer  Mode = "server"
)

func DetailsForSigners(pubkeys []string, kinds map[string]SignerKind) []Detail {
	out := make([]Detail, 0, len(pubkeys))
	for _, pk := range pubkeys {
		k := KindEOA
		if kinds != nil {
			if v, ok := kinds[pk]; ok {
				k = v
			}
		}
		out = append(out, Detail{
			Pubkey:       pk,
			SignerKind:   k,
			UserMustSign: k == KindEOA,
		})
	}
	return out
}

func ModeFromDetails(details []Detail) Mode {
	if len(details) == 0 {
		return ModeFull
	}
	user, server := 0, 0
	for _, d := range details {
		if d.UserMustSign {
			user++
		} else {
			server++
		}
	}
	if user == 0 && server > 0 {
		return ModeServer
	}
	if user > 0 && server > 0 {
		return ModePartial
	}
	return ModeFull
}
