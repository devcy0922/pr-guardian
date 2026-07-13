import fs from 'node:fs/promises';
import path from 'node:path';
import type { CheckRunResult } from './checklist/index.js';

/**
 * 분석 결과를 가독성 높은 HTML 리포트 대시보드로 렌더링 및 로컬 저장
 */
export async function renderHtmlReport(
  checkResults: CheckRunResult,
  elapsedMs: number,
  outputPath: string
): Promise<string> {
  const root = process.cwd();
  const templatePath = path.join(root, 'src', 'templates', 'report-template.html');
  
  let html = await fs.readFile(templatePath, 'utf-8');

  // 1. 요약 데이터 바인딩
  const summary = checkResults.results.find((r) => r.id === 'summary');
  const summaryHtml = summary 
    ? `<ul>${summary.detail.split('\n').filter(Boolean).map(line => `<li>${line.replace(/^- /, '')}</li>`).join('')}</ul>`
    : '<p>요약 정보 없음</p>';
  html = html.replace('<!-- SUMMARY_CONTENT -->', summaryHtml);

  // 2. 체크리스트 테이블 생성
  const tableChecks = checkResults.results.filter((r) => r.id !== 'summary' && r.id !== 'file-classify');
  let tableHtml = `
    <table>
      <thead>
        <tr>
          <th>항목</th>
          <th>상태</th>
          <th>상세 분석</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const check of tableChecks) {
    const badgeClass = `badge-${check.status}`;
    tableHtml += `
      <tr>
        <td><strong>${check.label}</strong></td>
        <td><span class="badge ${badgeClass}">${check.emoji} ${check.status.toUpperCase()}</span></td>
        <td>${check.detail.replace(/\n/g, '<br>')}</td>
      </tr>
    `;
  }
  tableHtml += '</tbody></table>';
  html = html.replace('<!-- CHECKLIST_TABLE -->', tableHtml);

  // 3. 파일 분류 테이블 생성
  const fileClassify = checkResults.results.find((r) => r.id === 'file-classify');
  let fileHtml = '<p>파일 정보 없음</p>';
  if (fileClassify) {
    // 마크다운 테이블 파싱하여 단순 HTML 테이블로 변환
    const rows = fileClassify.detail.split('\n').filter(r => r.includes('|') && !r.includes('---|'));
    if (rows.length > 1) {
      const headers = rows[0].split('|').map(s => s.trim()).filter(Boolean);
      const bodyRows = rows.slice(1);
      
      fileHtml = '<table><thead><tr>';
      for (const h of headers) fileHtml += `<th>${h}</th>`;
      fileHtml += '</tr></thead><tbody>';
      
      for (const row of bodyRows) {
        const cols = row.split('|').map(s => s.trim()).filter(Boolean);
        fileHtml += '<tr>';
        for (const c of cols) fileHtml += `<td>${c}</td>`;
        fileHtml += '</tr>';
      }
      fileHtml += '</tbody></table>';
    }
  }
  html = html.replace('<!-- FILE_TABLE -->', fileHtml);

  // 4. 메타 정보 바인딩
  const { totalUsage, llmCalls } = checkResults;
  const elapsed = (elapsedMs / 1000).toFixed(1);
  const metaHtml = `LLM 호출: ${llmCalls}회 | 토큰 사용: ${totalUsage.totalTokens} | 소요: ${elapsed}s`;
  html = html.replace('<!-- META_INFO -->', metaHtml);

  // 폴더 자동 생성 및 저장
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, 'utf-8');
  
  return html;
}
