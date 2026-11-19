export async function gh(token, apiPath, { method = 'GET', body, accept } = {}) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Accept: accept || 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jd-ai-usercase-ci',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data };
}

export async function fetchPull(token, repo, number) {
  let last;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await gh(token, `/repos/${repo}/pulls/${number}`);
    if (res.status !== 200) throw new Error(`無法讀取 PR #${number}（HTTP ${res.status}）`);
    last = res.data;
    if (last.mergeable !== null && last.mergeable !== undefined) return last;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return last;
}

export async function listPullFiles(token, repo, number) {
  const files = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await gh(token, `/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new Error(`無法讀取 PR 檔案清單（HTTP ${res.status}）`);
    }
    files.push(...res.data);
    if (res.data.length < 100) break;
  }
  return files;
}

export async function listCheckRuns(token, repo, sha) {
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await gh(token, `/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`);
    if (res.status !== 200) throw new Error(`無法讀取檢查（HTTP ${res.status}）`);
    const batch = res.data.check_runs || [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return runs;
}

export async function lookupIssues(token, repo, numbers) {
  const existing = [];
  const missing = [];
  for (const number of numbers) {
    const res = await gh(token, `/repos/${repo}/issues/${number}`);
    if (res.status === 200) existing.push(number);
    else missing.push(number);
  }
  return { existing, missing };
}
