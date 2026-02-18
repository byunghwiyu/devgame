export enum BattleState {
  IDLE = "IDLE",
  ATTACK_INPUT = "ATTACK_INPUT",
  DEFENSE_INPUT = "DEFENSE_INPUT",
  RESOLVE = "RESOLVE",
}

type BattleStateOptions = {
  onAutoAttack?: () => void;
  onNoDefense?: () => void;
  onResolve?: (inputs: RoundInputs) => void;
};

export type RoundInputs = {
  attackInput?: string;
  defenseInput?: string;
};

export type RoundDamage = {
  damageToMonster: number;
  damageToPlayer: number;
};

export type BattleLoopResult = {
  winner: "player" | "monster";
  playerHp: number;
  monsterHp: number;
  rounds: number;
};

export class BattleStateMachine {
  public currentState: BattleState = BattleState.IDLE;
  public readonly log: string[] = [];

  public readonly attackTimeoutMs = 6000;
  public readonly defenseTimeoutMs = 4000;

  private readonly options: BattleStateOptions;
  private attackTimer: ReturnType<typeof setTimeout> | null = null;
  private defenseTimer: ReturnType<typeof setTimeout> | null = null;
  private attackTickTimer: ReturnType<typeof setInterval> | null = null;
  private defenseTickTimer: ReturnType<typeof setInterval> | null = null;
  private roundInputs: RoundInputs = {};
  private roundResolver: ((inputs: RoundInputs) => void) | null = null;

  constructor(options?: BattleStateOptions) {
    this.options = options ?? {};
  }

  startRound(): Promise<RoundInputs> {
    this.clearTimers();
    this.roundInputs = {};
    this.currentState = BattleState.ATTACK_INPUT;
    this.log.push("라운드 시작");

    this.startAttackCountdown();
    this.attackTimer = setTimeout(() => {
      if (this.currentState !== BattleState.ATTACK_INPUT) return;
      this.log.push("시간 초과! 기본 공격 발동");
      this.roundInputs.attackInput = "ATTACK";
      this.options.onAutoAttack?.();
      this.enterDefenseInput();
    }, this.attackTimeoutMs);

    return new Promise<RoundInputs>((resolve) => {
      this.roundResolver = resolve;
    });
  }

  async runBattleLoop(
    initial: { playerHp: number; monsterHp: number },
    resolveRoundDamage: (inputs: RoundInputs, round: number) => RoundDamage | Promise<RoundDamage>,
  ): Promise<BattleLoopResult> {
    let round = 0;
    let playerHp = initial.playerHp;
    let monsterHp = initial.monsterHp;

    while (playerHp > 0 && monsterHp > 0) {
      round += 1;
      const inputs = await this.startRound();
      const damage = await resolveRoundDamage(inputs, round);

      monsterHp = Math.max(0, monsterHp - Math.max(0, damage.damageToMonster));
      playerHp = Math.max(0, playerHp - Math.max(0, damage.damageToPlayer));

      this.log.push(`라운드 ${round} 결과: 플레이어 HP=${playerHp}, 몬스터 HP=${monsterHp}`);
    }

    const winner: "player" | "monster" = monsterHp <= 0 ? "player" : "monster";
    this.log.push(winner === "player" ? "플레이어 승리" : "몬스터 승리");

    this.currentState = BattleState.IDLE;
    this.clearTimers();

    return { winner, playerHp, monsterHp, rounds: round };
  }

  submitAttackInput(input: string): void {
    if (this.currentState !== BattleState.ATTACK_INPUT) return;
    this.roundInputs.attackInput = input;
    this.log.push(`공격 입력 완료: ${input || "ATTACK"}`);
    this.enterDefenseInput();
  }

  submitDefenseInput(input: string): void {
    if (this.currentState !== BattleState.DEFENSE_INPUT) return;
    this.roundInputs.defenseInput = input;
    this.log.push(`방어 입력 완료: ${input || "none"}`);
    this.enterResolve();
  }

  getInputs(): RoundInputs {
    return { ...this.roundInputs };
  }

  reset(): void {
    this.clearTimers();
    this.roundInputs = {};
    this.roundResolver = null;
    this.currentState = BattleState.IDLE;
    this.log.push("상태 초기화");
  }

  private enterDefenseInput(): void {
    this.clearAttackTimers();
    this.currentState = BattleState.DEFENSE_INPUT;

    this.startDefenseCountdown();
    this.defenseTimer = setTimeout(() => {
      if (this.currentState !== BattleState.DEFENSE_INPUT) return;
      this.log.push("시간 초과! 방어 실패");
      this.roundInputs.defenseInput = "";
      this.options.onNoDefense?.();
      this.enterResolve();
    }, this.defenseTimeoutMs);
  }

  private enterResolve(): void {
    this.clearDefenseTimers();
    this.currentState = BattleState.RESOLVE;
    this.log.push("RESOLVE 진입");
    this.options.onResolve?.(this.getInputs());

    const resolver = this.roundResolver;
    this.roundResolver = null;
    if (resolver) resolver(this.getInputs());
  }

  private startAttackCountdown(): void {
    let remaining = Math.ceil(this.attackTimeoutMs / 1000);
    this.log.push(`공격 입력 남은 시간: ${remaining}s`);

    this.attackTickTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this.clearAttackTickTimer();
        return;
      }
      this.log.push(`공격 입력 남은 시간: ${remaining}s`);
    }, 1000);
  }

  private startDefenseCountdown(): void {
    let remaining = Math.ceil(this.defenseTimeoutMs / 1000);
    this.log.push(`방어 입력 남은 시간: ${remaining}s`);

    this.defenseTickTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this.clearDefenseTickTimer();
        return;
      }
      this.log.push(`방어 입력 남은 시간: ${remaining}s`);
    }, 1000);
  }

  private clearTimers(): void {
    this.clearAttackTimers();
    this.clearDefenseTimers();
  }

  private clearAttackTimers(): void {
    if (this.attackTimer) {
      clearTimeout(this.attackTimer);
      this.attackTimer = null;
    }
    this.clearAttackTickTimer();
  }

  private clearDefenseTimers(): void {
    if (this.defenseTimer) {
      clearTimeout(this.defenseTimer);
      this.defenseTimer = null;
    }
    this.clearDefenseTickTimer();
  }

  private clearAttackTickTimer(): void {
    if (this.attackTickTimer) {
      clearInterval(this.attackTickTimer);
      this.attackTickTimer = null;
    }
  }

  private clearDefenseTickTimer(): void {
    if (this.defenseTickTimer) {
      clearInterval(this.defenseTickTimer);
      this.defenseTickTimer = null;
    }
  }
}
