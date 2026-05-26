import { Injectable, Logger } from '@nestjs/common';
import { ChurnDetectorService, type ChurnDetectionResult } from './churn-detector.service';
import { ChurnNudgeService, type NudgeDispatchResult } from './churn-nudge.service';

export interface ChurnCycleResult {
  detection: ChurnDetectionResult;
  dispatch: NudgeDispatchResult;
}

@Injectable()
export class ChurnEngineService {
  private readonly logger = new Logger(ChurnEngineService.name);

  constructor(
    private readonly detector: ChurnDetectorService,
    private readonly nudge: ChurnNudgeService,
  ) {}

  async runCycle(tenantId: string, now: Date = new Date()): Promise<ChurnCycleResult> {
    this.logger.log(`Churn cycle start tenant=${tenantId}`);
    const detection = await this.detector.detectForTenant(tenantId, now);
    const dispatch = await this.nudge.dispatchPending(tenantId, now);
    return { detection, dispatch };
  }
}
