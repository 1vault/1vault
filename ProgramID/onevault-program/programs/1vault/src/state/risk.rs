use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultRiskState {
    pub vault: Pubkey,
    pub daily_loss_limit_bps: u16,
    pub daily_loss_bps: u16,
    pub max_drawdown_bps: u16,
    pub current_drawdown_bps: u16,
    pub peak_nav: u64,
    pub last_reset_day: i64,
    pub circuit_breaker_active: bool,
    pub bump: u8,
}

impl VaultRiskState {
    pub fn day_index(timestamp: i64) -> i64 {
        timestamp / 86_400
    }

    pub fn maybe_reset_day(&mut self, now: i64) {
        let day = Self::day_index(now);
        if day > self.last_reset_day {
            self.daily_loss_bps = 0;
            self.last_reset_day = day;
        }
    }

    pub fn record_nav(&mut self, nav: u64) -> Result<()> {
        if nav > self.peak_nav {
            self.peak_nav = nav;
            self.current_drawdown_bps = 0;
            return Ok(());
        }
        if self.peak_nav == 0 {
            self.peak_nav = nav;
            return Ok(());
        }
        let drawdown = ((self.peak_nav - nav) as u128)
            .checked_mul(crate::constants::BPS_DENOMINATOR as u128)
            .and_then(|v| v.checked_div(self.peak_nav as u128))
            .ok_or(error!(crate::OneVaultError::MathOverflow))? as u16;
        self.current_drawdown_bps = drawdown;
        Ok(())
    }

    pub fn record_daily_loss(&mut self, loss_bps: u16) {
        self.daily_loss_bps = self.daily_loss_bps.saturating_add(loss_bps);
    }

    pub fn is_trade_allowed(&self) -> bool {
        !self.circuit_breaker_active
    }

    pub fn evaluate_limits(&mut self, now: i64) -> Result<bool> {
        self.maybe_reset_day(now);
        if self.daily_loss_bps >= self.daily_loss_limit_bps && self.daily_loss_limit_bps > 0 {
            self.circuit_breaker_active = true;
            return Ok(false);
        }
        if self.current_drawdown_bps >= self.max_drawdown_bps && self.max_drawdown_bps > 0 {
            self.circuit_breaker_active = true;
            return Ok(false);
        }
        Ok(true)
    }
}
