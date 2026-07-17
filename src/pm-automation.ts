import type { PullRequestData, PullRequestFile, GitHubClient } from './github.js';

export interface PMAutomationContext {
  pr: PullRequestData;
  files: PullRequestFile[];
  jira: {
    summary: string;
    description: string;
    fixVersions: string[];
  } | null;
}

/**
 * PR 메타데이터(라벨, 마일스톤, 프로젝트 보드)를 자동으로 매핑하고 업데이트하는 서비스
 */
export class PMAutomationService {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * 자동화 파이프라인 실행
   */
  async run(owner: string, repo: string, prNumber: number, context: PMAutomationContext): Promise<void> {
    const enabled = process.env.AUTO_PM_ENABLED !== 'false';
    if (!enabled) {
      console.log('[PM-Automation] 자동화 기능 비활성화 상태 (AUTO_PM_ENABLED=false)');
      return;
    }

    console.log(`[PM-Automation] PR #${prNumber} 메타데이터 자동화 처리 시작`);

    try {
      // 1. 라벨 자동 지정
      await this.processLabels(owner, repo, prNumber, context);
    } catch (err) {
      console.error(`[PM-Automation] 라벨 지정 실패:`, err);
    }

    try {
      // 2. 마일스톤 자동 지정
      await this.processMilestone(owner, repo, prNumber, context);
    } catch (err) {
      console.error(`[PM-Automation] 마일스톤 지정 실패:`, err);
    }

    try {
      // 3. 프로젝트 보드 자동 연동
      await this.processProject(owner, prNumber, context);
    } catch (err) {
      console.error(`[PM-Automation] 프로젝트 보드 연동 실패:`, err);
    }
  }

  /**
   * 라벨을 예측하고 PR에 부여
   */
  private async processLabels(owner: string, repo: string, prNumber: number, context: PMAutomationContext): Promise<void> {
    const labels = new Set<string>();

    // 1) PR 제목 기반 규칙 매칭
    const title = context.pr.title.toLowerCase();
    if (title.startsWith('feat:') || title.startsWith('feature/')) labels.add('enhancement');
    else if (title.startsWith('fix:') || title.startsWith('bug/')) labels.add('bug');
    else if (title.startsWith('docs:') || title.startsWith('documentation/')) labels.add('documentation');
    else if (title.startsWith('test:') || title.startsWith('tests/')) labels.add('test');
    else if (title.startsWith('refactor:') || title.startsWith('refactoring/')) labels.add('refactor');
    else if (title.startsWith('chore:')) labels.add('chore');

    // 2) PR 브랜치명 기반 규칙 매칭
    const branch = context.pr.branch.toLowerCase();
    if (branch.startsWith('feature/') || branch.startsWith('feat/')) labels.add('enhancement');
    else if (branch.startsWith('bug/') || branch.startsWith('fix/') || branch.startsWith('hotfix/')) labels.add('bug');
    else if (branch.startsWith('docs/')) labels.add('documentation');
    else if (branch.startsWith('test/') || branch.startsWith('tests/')) labels.add('test');
    else if (branch.startsWith('refactor/') || branch.startsWith('refactoring/')) labels.add('refactor');
    else if (branch.startsWith('chore/')) labels.add('chore');

    // 3) 변경 파일 분석
    for (const file of context.files) {
      if (file.filename.includes('tests/') || file.filename.endsWith('.test.ts') || file.filename.endsWith('.test.js')) {
        labels.add('test');
      }
      if (file.filename === 'package.json' || file.filename === 'pnpm-lock.yaml' || file.filename === 'Dockerfile' || file.filename === 'docker-compose.yml') {
        labels.add('chore');
      }
      if (file.filename.startsWith('.github/workflows/')) {
        labels.add('ci');
      }
    }

    if (labels.size > 0) {
      const labelArray = Array.from(labels);
      console.log(`[PM-Automation] 부여할 라벨 감지: ${labelArray.join(', ')}`);
      await this.github.addLabels(owner, repo, prNumber, labelArray);
    } else {
      console.log('[PM-Automation] 매칭된 라벨이 없습니다.');
    }
  }

  /**
   * Jira fixVersions 또는 브랜치/제목 내 버전 패턴을 분석하여 마일스톤 지정
   */
  private async processMilestone(owner: string, repo: string, prNumber: number, context: PMAutomationContext): Promise<void> {
    const targetVersions: string[] = [];

    // 1) Jira fixVersions 탐색
    if (context.jira && context.jira.fixVersions && context.jira.fixVersions.length > 0) {
      targetVersions.push(...context.jira.fixVersions);
    }

    // 2) 예비 처리를 위한 브랜치명/제목의 버전 정규식 매핑 (예: v1.2.0, release-1.3, 2.0.4)
    const versionPattern = /v?(\d+\.\d+\.\d+)/i;
    const branchMatch = context.pr.branch.match(versionPattern);
    if (branchMatch) targetVersions.push(branchMatch[1]);
    const titleMatch = context.pr.title.match(versionPattern);
    if (titleMatch) targetVersions.push(titleMatch[1]);

    if (targetVersions.length === 0) {
      console.log('[PM-Automation] 감지된 버전 정보가 없어 마일스톤 매핑을 건너뜁니다.');
      return;
    }

    // 중복 제거 및 포맷팅 (앞의 'v' 제거하고 순수 숫자 세그먼트로 비교하기 위함)
    const cleanVersions = Array.from(new Set(
      targetVersions.map(v => v.replace(/^v/i, '').trim())
    ));

    console.log(`[PM-Automation] 분석된 타겟 버전 목록: ${cleanVersions.join(', ')}`);

    // 리포지토리의 Open 상태 마일스톤 조회
    const openMilestones = await this.github.listMilestones(owner, repo);

    // 타겟 버전 중 깃허브 마일스톤과 일치하는 것 찾기
    for (const ver of cleanVersions) {
      const matched = openMilestones.find((m: any) => {
        const title = m.title.replace(/^v/i, '').trim();
        return title === ver;
      });

      if (matched) {
        console.log(`[PM-Automation] 일치하는 마일스톤 발견: "${matched.title}" (ID: ${matched.number})`);
        await this.github.updatePullRequestMilestone(owner, repo, prNumber, matched.number);
        return; // 하나만 할당 가능하므로 매핑 완료 시 종료
      }
    }

    // 일치하는 마일스톤이 없는 경우 자동 생성 시도
    const autoCreate = process.env.AUTO_PM_CREATE_MILESTONE === 'true';
    if (autoCreate && cleanVersions.length > 0) {
      const milestoneTitle = `v${cleanVersions[0]}`;
      console.log(`[PM-Automation] 일치하는 마일스톤이 없어 새로운 마일스톤 "${milestoneTitle}" 생성을 시도합니다.`);
      try {
        const newMilestone = await this.github.createMilestone(owner, repo, milestoneTitle);
        console.log(`[PM-Automation] 신규 마일스톤 생성 완료 (ID: ${newMilestone.number})`);
        await this.github.updatePullRequestMilestone(owner, repo, prNumber, newMilestone.number);
      } catch (err) {
        console.error(`[PM-Automation] 마일스톤 생성 또는 매핑 중 오류 발생:`, err);
      }
    } else {
      console.log('[PM-Automation] 일치하는 마일스톤이 깃허브에 존재하지 않으며 자동 생성 옵션이 비활성화 상태입니다.');
    }
  }

  /**
   * 설정된 프로젝트 보드(ProjectV2)에 PR 아이템 자동 등록
   */
  private async processProject(owner: string, prNumber: number, context: PMAutomationContext): Promise<void> {
    const projectNumStr = process.env.AUTO_PM_PROJECT_NUMBER;
    if (!projectNumStr) {
      console.log('[PM-Automation] 프로젝트 번호(AUTO_PM_PROJECT_NUMBER)가 정의되지 않아 연동을 스킵합니다.');
      return;
    }

    const projectNumber = parseInt(projectNumStr, 10);
    if (isNaN(projectNumber)) {
      console.warn(`[PM-Automation] 유효하지 않은 프로젝트 번호 형식: ${projectNumStr}`);
      return;
    }

    const nodeId = context.pr.nodeId;
    if (!nodeId) {
      console.warn(`[PM-Automation] PR의 GraphQL nodeId를 획득하지 못해 프로젝트 연동 불가`);
      return;
    }

    console.log(`[PM-Automation] Project #${projectNumber} 연동 대상 ID 조회 중...`);
    const projectId = await this.github.getProjectV2Id(owner, projectNumber);
    if (!projectId) {
      console.warn(`[PM-Automation] Project #${projectNumber} 에 해당하는 ProjectV2 ID를 가져오지 못했습니다.`);
      return;
    }

    console.log(`[PM-Automation] ProjectV2 (ID: ${projectId})에 PR (NodeID: ${nodeId}) 카드 추가 중...`);
    const itemId = await this.github.addProjectV2Item(projectId, nodeId);
    if (itemId) {
      console.log(`[PM-Automation] 프로젝트 보드에 카드 추가 성공 (Item ID: ${itemId})`);
    } else {
      console.error('[PM-Automation] 프로젝트 보드에 카드 추가 실패');
    }
  }
}
