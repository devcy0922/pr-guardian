export interface JiraIssueData {
  key: string;
  summary: string;
  description: string;
  fixVersions: string[];
}

/**
 * Jira Cloud API 연동 클라이언트
 */
export class JiraClient {
  private host: string;
  private email: string;
  private token: string;

  constructor() {
    this.host = process.env.JIRA_HOST ?? '';
    this.email = process.env.JIRA_EMAIL ?? '';
    this.token = process.env.JIRA_API_TOKEN ?? '';
  }

  /** Jira 이슈 데이터 가져오기 */
  async getIssue(issueKey: string): Promise<JiraIssueData | null> {
    if (!this.host || !this.email || !this.token) {
      console.warn('[Jira] 설정 정보가 누락되어 Jira 연동을 스킵합니다.');
      return null;
    }

    const auth = Buffer.from(`${this.email}:${this.token}`).toString('base64');
    const url = `https://${this.host}/rest/api/3/issue/${issueKey}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        }
      });

      if (!res.ok) {
        console.warn(`[Jira] 이슈 조회 실패 (HTTP ${res.status})`);
        return null;
      }

      const data = await res.json() as any;
      const summary = data.fields?.summary ?? '';
      const adfDescription = data.fields?.description;
      const description = extractTextFromADF(adfDescription);
      const fixVersions = (data.fields?.fixVersions ?? []).map((v: any) => v.name as string);

      return {
        key: issueKey,
        summary,
        description,
        fixVersions
      };
    } catch (err) {
      console.error(`[Jira] API 호출 오류:`, err);
      return null;
    }
  }
}

/**
 * Atlassian Document Format(ADF) 구조에서 일반 텍스트를 재귀적으로 결합하여 추출
 */
function extractTextFromADF(adf: any): string {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  
  let text = '';
  if (adf.type === 'text' && adf.text) {
    text += adf.text;
  }
  if (adf.content && Array.isArray(adf.content)) {
    for (const child of adf.content) {
      text += extractTextFromADF(child) + ' ';
    }
  }
  return text.trim().replace(/\s+/g, ' ');
}
