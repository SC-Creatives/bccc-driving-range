import { TUNING } from '../../config/tuning';
import type { GameState } from '../state';

/**
 * Reward + grading. The announcer grade buckets are ported verbatim from the
 * prototype's gradeShot(). `newCode()` is the client-side placeholder reveal —
 * Phase 2 replaces it with a server-minted single-use Shopify code gated behind
 * email capture (bccc-backend-spec.md §1-2).
 */
export const Reward = {
  /** Client-side placeholder promo code. NOT a real code — see backend spec §0. */
  newCode(): string {
    let c = 'BCCC-';
    const a = 'ACDEFGHJKLMNPRTUVWXY3479';
    for (let i = 0; i < 4; i++) c += a[Math.floor(Math.random() * a.length)];
    return c;
  },

  /** Deadpan club-announcer grade. Maps (yards, Q) -> grade + line. */
  gradeShot(s: GameState, yd: number, Q: number): void {
    if (Q < 0.32) {
      s.resultGrade = 'Shanked It';
      s.resultLine = '“…we’ll mark that one as a practice swing.”';
    } else if (yd >= 330) {
      s.resultGrade = 'Absolute Cannon';
      s.resultLine = '“A drive worthy of the back nine, sir.”';
    } else if (yd >= TUNING.MEMBER_THRESHOLD) {
      s.resultGrade = 'Now That’s Clubhouse Talk';
      s.resultLine = '“The members are nodding. Quietly impressed.”';
    } else if (yd >= 230) {
      s.resultGrade = 'Respectable';
      s.resultLine = '“Solid contact. The beverage cart approves.”';
    } else if (yd >= 160) {
      s.resultGrade = 'On the Short Grass';
      s.resultLine = '“Not every swing’s a highlight. Tee up another.”';
    } else {
      s.resultGrade = 'Worm Burner';
      s.resultLine = '“It went forward. We’re calling that a positive.”';
    }
    // PURE is the pinnacle: an elite strike AND a true bomb. Floor raised
    // 300 -> CHEER_THRESHOLD (340) 2026-07-06 — the perfect-lock snap made
    // flushed strikes common enough that PURE was firing on ordinary 300-330
    // drives (owner call at a 331). Now PURE and the crowd roar land together.
    if (Q >= 0.97 && yd >= TUNING.CHEER_THRESHOLD) s.resultGrade = 'PURE — Flushed It';
  },
};
