/* JD2MD 簡單版：在瀏覽器內把一份 JD 收成工作模組 Markdown。不送出、不呼叫模型。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JD2MD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX_CHARS = 12000;
  var MAX_MODULES = 6;

  // title：職稱比對，命中就只用這一類。re：職稱看不出來時，才用職責內文數關鍵字。
  // 內文不收 forecast、budget、financial 這類字：工程與業務的 JD 也常出現（error budget、sales forecast）。
  // 順序有意義：前面的先比。「Product Designer」要先被 design 接走，「Safety Engineer」要先被 safety 接走。
  var FAMILIES = [
    { id: 'clinical', title: /護理|護士|\bnurs(e|ing)\b/i, re: /護理|護士|病房|給藥|病歷|生命徵象|病患|護理師|\bnurs(e|ing)\b/i },
    { id: 'design', title: /designer|\bux\b|\bui\b|設計師|art director|visual design|美術/i, re: /設計稿|視覺設計|介面設計|wireframe|prototyp|design system|user research/i },
    { id: 'legal', title: /counsel|\blegal\b|paralegal|attorney|lawyer|法務|律師/i, re: /合約|契約|法規|法遵|訴訟|\bcontracts?\b|legal (advice|research|risk)|litigation/i },
    { id: 'support', title: /customer (service|support|care|experience)|(technical|customer) care|support (specialist|associate|agent|representative|advisor)|客服|客戶服務|help ?desk agent/i, re: /客服|客訴|來電|退換貨|customer (inquir|contact|complaint)|support tickets?/i },
    { id: 'safety', title: /safety|\behs\b|\bwhs\b|\bhse\b|職安|環安|工安/i, re: /職安|工安|巡檢|職災|safety (audit|inspection|training)|incident investigation|hazard/i },
    { id: 'it', title: /it support|it technician|it engineer|desktop support|service desk|data cent(er|re) (technician|engineer|operations)|資訊人員|\bmis\b|網管/i, re: /故障排除|報修|資訊設備|help ?desk|break.?fix|cabling|technical support/i },
    { id: 'finance', title: /financ|accountant|accounting|財務|會計|fp&a|controller|treasury|\btax\b|internal audit|auditor\b|出納|payable|receivable/i, re: /財務|會計|預算|fp&a|月結|帳務|資金|財報|month-end|general ledger|journal entr|reconciliation/i },
    { id: 'data', title: /data analyst|business intelligence|\bbi\b|analytics|business analyst|data scientist|資料分析|數據分析|商業分析/i, re: /資料分析|數據分析|儀表板|\bsql\b|dashboards?|data (pipeline|warehouse|model)/i },
    { id: 'hr', title: /recruit|candidate experience|talent acquisition|human resources|\bhr\b|people (ops|partner|operations)|人資|招募|薪酬|payroll/i, re: /人資|招募|薪資|面試|任用|recruiting|candidates|payroll/i },
    { id: 'product', title: /product (manager|mgr)|program (manager|mgr)|project (manager|mgr)|product owner|產品經理|專案經理|\bpm\b|\btpm\b|\bpmt\b|專案管理/i, re: /產品規劃|需求文件|專案進度|roadmap|\bprds?\b|user stories|project plans?/i },
    { id: 'content', title: /marketing|content|copywrit|social media|\bbrand|行銷|文案|社群|編輯|小編|communications|editor/i, re: /文案|行銷|社群|品牌|內容規劃|內容日曆|行銷企劃|copywriting|content calendar|social media/i },
    { id: 'sales', title: /account executive|\bsales\b|business development|業務|銷售|account manager/i, re: /業務|銷售|報價|客戶開發|訂單|收款|展會|業績|account executive|sales rep|\bquota\b|prospect/i },
    { id: 'engineering', title: /engineer|developer|\bsde\b|software dev|\bsre\b|devops|architect|工程師|程式|scientist/i, re: /軟體|工程師|程式碼|程式開發|後端|前端|系統設計|code review|\bapi\b/i },
    { id: 'logistics', title: /operations (manager|associate|specialist|lead|supervisor|analyst)|area manager|shift manager|supply chain|logistics|warehouse|fulfil+ment|transportation|倉儲|物流|營運|供應鏈|倉管|調度/i, re: /倉儲|物流|出貨|排班|盤點|供應鏈|warehouse|fulfil+ment cent|supply chain|shift (performance|plan)/i },
    { id: 'ops', title: /行政|採購|總務|procurement|office manager|administrative|purchasing|executive assistant|秘書|助理/i, re: /行政|採購|總務|庶務|公文|用印|procurement|purchase order/i }
  ];

  function titleFamily(title) {
    for (var i = 0; i < FAMILIES.length; i += 1) {
      if (FAMILIES[i].title.test(title)) return FAMILIES[i].id;
    }
    return '';
  }

  function mod(spec) {
    spec.cross = !!spec.cross;
    return spec;
  }

  var MODULES = [
    mod({
      id: 'fin-plan',
      name: '財務規劃、預算與月結',
      families: ['finance'],
      level: 'AUG',
      levelWhy: '草稿與清單可以交，會進正式版的假設與數字要人核准。',
      trigger: '編預算、更新預測，或到了月結',
      output: '一份對得起來的預算／預測底稿，以及月結要處理的項目',
      inputs: ['實際數、前一版預算與預測', '科目或專案範圍', '這次誰有權核准假設'],
      steps: [
        ['AI 做', '把科目、期間、版本與缺的欄位整理成一份清單'],
        ['人核准', '成長率、假設，以及任何會進正式版的數字'],
        ['AI 做', '只依已核准的數字起草變動說明，不補造原因'],
        ['人做', '鎖定版本；正式系統由人回寫']
      ],
      accept: '金額與已核准的來源一致；說明裡的每個數字都回得去來源。',
      risks: ['把尚未核准的假設寫成事實', '月結未完就當成可以發布'],
      patterns: [/預算/, /forecast/i, /財務規劃/, /financial planning/i, /滾動預測/, /budget/i, /月結/, /month-end/i, /年度計畫/, /編列/]
    }),
    mod({
      id: 'fin-close',
      name: '關帳、對帳與分錄',
      families: ['finance'],
      level: 'HUMAN-LEAD',
      levelWhy: '底稿可以整理，分錄、調節與關帳由人核准後才算數。',
      trigger: '到了月結、季結，或要做收入認列與調節',
      output: '關帳清單、調節表與分錄底稿',
      inputs: ['科目餘額與夥伴回報的數字', '調節項目與未決差異', '誰可以核准分錄'],
      steps: [
        ['AI 做', '把科目、差異與缺的附件整理成關帳清單'],
        ['人核准', '分錄、調節與會進正式帳的判斷'],
        ['AI 做', '依已核准的數字起草說明，不補原因'],
        ['人做', '過帳、關帳與對稽核交件']
      ],
      accept: '每筆分錄都對得回已核准的數字；沒對上的差異保持空白。',
      risks: ['把未核准的估計寫成已入帳', '為了準時關帳而補上沒有來源的數字'],
      patterns: [/revenue close/i, /month-end close/i, /journal entr/i, /reconcil/i, /accrual/i, /true-up/i, /關帳/, /分錄/, /調節/, /\bclose\b/i]
    }),
    mod({
      id: 'fin-report',
      name: '管理報告與差異說明',
      families: ['finance'],
      level: 'AUG',
      levelWhy: '差異說明可以起草，對主管的結論與發布要人定稿。',
      trigger: '固定出報的日子，或主管要一份差異說明',
      output: '差異說明草稿，每句話對得到比較基準與來源',
      inputs: ['實際、預算、預測或去年的同一口徑', '這份報告的讀者與期間', '已經確認的業務原因（沒有就留空）'],
      steps: [
        ['AI 做', '列出期間、比較基準，以及材料上的差異'],
        ['人核准', '口徑是否足以對主管說明'],
        ['AI 做', '起草差異說明；沒有來源的原因標成待確認'],
        ['人做', '定稿與發布']
      ],
      accept: '出現的數字與比較基準一致；沒有來源的句子沒有被寫成結論。',
      risks: ['用錯期間或版本', '把相關寫成因果'],
      patterns: [/差異分析/, /差異說明/, /variance/i, /管理報告/, /management report/i, /commentary/i, /經營報告/, /月報/, /\bflux\b/i, /revenue reporting/i]
    }),
    mod({
      id: 'fin-serve',
      name: '例行財務支援與自助報表',
      families: ['finance'],
      level: 'AUG',
      levelWhy: '重複的取數與說明可以交，口徑與權限要人定。',
      trigger: '業務單位日常來問數字，或要做自助報表',
      output: '一張問答或報表說明，附定義、日期與還不能自助的項目',
      inputs: ['被重複問到的問題', '指標定義與資料日期', '哪些數字可以給這個讀者'],
      steps: [
        ['AI 做', '把重複問題收成表，標出哪些已有固定答案'],
        ['人核准', '哪些可以自助、哪些必須人回'],
        ['AI 做', '起草回答或報表說明，附定義與日期'],
        ['人做', '開放權限；對外的數字由人發出']
      ],
      accept: '每個自助答案都有定義與日期；沒有定義的問題沒有被答死。',
      risks: ['口徑未定就做成自助', '權限放大後看到不該看的明細'],
      patterns: [/dashboard/i, /儀表板/, /self-serve/i, /自助/, /自動化報/, /automate report/i, /operational support/i, /day-to-day/i, /日常支援/, /例行支援/]
    }),
    mod({
      id: 'fin-research',
      name: '專案與產業分析',
      families: ['finance'],
      level: 'AUG',
      levelWhy: '整理來源可以交，要不要拿來做決策要人看過出處。',
      trigger: '有一個臨時分析或產業問題，而且有截止日',
      output: '附出處的發現清單，找不到的項目保持空白',
      inputs: ['要回答的問題與截止日', '可以引用的內部數字', '可信來源的範圍'],
      steps: [
        ['AI 做', '把問題拆成要查的項目，並寫上截止日'],
        ['人核准', '範圍與哪些來源可信'],
        ['AI 做', '整理發現，每條附出處；找不到就留空'],
        ['人做', '決定要不要採用']
      ],
      accept: '每條發現都有出處，或被明確標成找不到。',
      risks: ['補寫查不到的數字', '把搜尋摘要當成原始出處'],
      patterns: [/ad-hoc/i, /產業分析/, /industry analysis/i, /產業研究/, /追蹤 kpi/i, /\bkpis?\b/i, /競品/, /industry/i]
    }),
    mod({
      id: 'sales-q2c',
      name: '報價到收款',
      families: ['sales'],
      level: 'AUG',
      levelWhy: '報價單與未結款清單可以起草，價格、折扣與放帳要人核准。',
      trigger: '收到詢價、訂單成立，或到了對帳、收款',
      output: '報價單草稿，以及訂單與收款狀態',
      inputs: ['詢價內容：規格、數量、交期', '價目與折扣權限', '未結訂單與應收餘額'],
      steps: [
        ['AI 做', '把詢價整理成規格、數量、交期，並列出未結款'],
        ['人核准', '價格、折扣，以及能不能放帳'],
        ['AI 做', '標出逾期或少資料的訂單'],
        ['人做', '送出報價、催收、確認入帳']
      ],
      accept: '報價數字沒有超出已給的價目與權限；每筆未結款都有狀態。',
      risks: ['折扣超過權限仍寫進報價', '把估計交期寫成承諾'],
      patterns: [/報價/, /訂單/, /收款/, /應收/, /對帳/, /請款/, /\bquot(e|es|ation|ations)\b/i, /\bproposals?\b/i, /\bcontracts?\b/i, /\binvoic/i, /order (processing|management|fulfil)/i, /\bpricing\b/i]
    }),
    mod({
      id: 'sales-prospect',
      name: '新客戶開發',
      families: ['sales'],
      level: 'AUG',
      levelWhy: '名單與跟進草稿可以交，要不要繼續經營要人判斷。',
      trigger: '要開發新客戶，或展會結束要跟進',
      output: '名單與跟進狀態，以及一封尚未送出的跟進草稿',
      inputs: ['現有名單或展會名片', '這次想開發的客戶類型', '已經答應過的下一步'],
      steps: [
        ['AI 做', '整理名單、名片與跟進狀態'],
        ['人核准', '哪些客戶值得繼續'],
        ['AI 做', '起草跟進信或拜訪前摘要'],
        ['人做', '拜訪、承諾，以及關係上的判斷']
      ],
      accept: '每一家被排進跟進的客戶都有來源；草稿沒有替人承諾價格或交期。',
      risks: ['把還不認識的客戶寫成已有往來', '在跟進信裡承諾折扣'],
      patterns: [/開發新客戶/, /新客戶開發/, /開發客戶/, /陌生開發/, /拓客/, /展會/, /客戶名單/, /拜訪新/, /新客開發/, /business development/i, /new business/i, /prospective customer/i, /new customer/i, /full sales cycle/i]
    }),
    mod({
      id: 'sales-forecast',
      name: '銷售預測與業績回報',
      families: ['sales'],
      level: 'AUG',
      levelWhy: '表格可以收，金額與把握度要人核准後才提交。',
      trigger: '到了每週或每月要交銷售預測',
      output: '一份銷售預測表，以及與上次的差異',
      inputs: ['進行中的案子與金額', '上次提交的預測', '這次的期間'],
      steps: [
        ['AI 做', '把進行中的案子收成一份預測表'],
        ['人核准', '金額與把握度'],
        ['AI 做', '標出與上次的差異'],
        ['人做', '向主管提交']
      ],
      accept: '表上的每筆金額都是人給的；沒有把握度的案子沒有被寫成確定業績。',
      risks: ['用空的 pipeline 補滿目標數字'],
      patterns: [/銷售預測/, /業績預測/, /業績回報/, /業績目標/, /sales forecast/i, /pipeline/i, /銷售週報/, /每週.{0,8}預測/, /每月.{0,8}預測/, /\bquotas?\b/i]
    }),
    mod({
      id: 'care-assess',
      name: '護理評估與生命徵象',
      families: ['clinical'],
      level: 'HUMAN-LEAD',
      levelWhy: '評估與量測要護理師做；AI 只整理已經量到的結果。',
      trigger: '入院、接班，或需要重新評估',
      output: '評估項目清單，以及依實測值整理的紀錄草稿',
      inputs: ['要評估的項目', '已經量到的數值與時間', '醫院的正常值範圍（沒有就不要猜）'],
      steps: [
        ['AI 做', '把要看的項目排成清單'],
        ['人做', '實際評估與量測'],
        ['AI 做', '只把已量到的數值整理成紀錄草稿'],
        ['人核准', '異常值要不要上報']
      ],
      accept: '草稿裡的每個數值都來自身邊的紀錄；沒量到的項目保持空白。',
      risks: ['AI 補上沒有量過的生命徵象', '用草稿取代護理師的判斷'],
      patterns: [/護理評估/, /生命徵象/, /量測/, /入院評估/, /身體評估/, /評估病/]
    }),
    mod({
      id: 'care-meds',
      name: '給藥與治療處置',
      families: ['clinical'],
      level: 'HUMAN-LEAD',
      levelWhy: '給藥與處置只能由有執照的人執行；AI 不建議劑量、不代替核對。',
      trigger: '有醫囑要給藥或做治療',
      output: '已完成項目的核對清單，不是給藥指令',
      inputs: ['醫囑原文', '護理師已經完成的核對結果', '病人身分的核對方式'],
      steps: [
        ['人做', '核對醫囑、病人與藥物，並執行給藥或處置'],
        ['AI 做', '只把已經完成的核對項目整理成清單，不建議劑量'],
        ['人核准', '清單與醫囑、實際給藥一致才寫入']
      ],
      accept: '清單沒有出現醫囑上沒有的藥；劑量沒有被改寫。',
      risks: ['把整理清單誤解成可以給藥', '漏掉尚未執行的醫囑卻顯示為完成'],
      patterns: [/給藥/, /用藥/, /治療處置/, /處置/, /注射/, /換藥/, /醫囑/]
    }),
    mod({
      id: 'care-chart',
      name: '護理紀錄',
      families: ['clinical'],
      level: 'AUG',
      levelWhy: '語句可以起草，寫入病歷前要護理師核對事實。',
      trigger: '做完照護，要寫進病歷',
      output: '病歷草稿',
      inputs: ['護理師已經記下的事實、時間與對象', '單位慣用的紀錄格式'],
      steps: [
        ['AI 做', '只依已經寫下的事實起草病歷語句'],
        ['人核准', '事實、時間與用詞'],
        ['人做', '寫入正式病歷']
      ],
      accept: '草稿沒有加入沒發生的處置；時間與對象跟來源一致。',
      risks: ['為了完整而補寫沒有做的照護'],
      patterns: [/病歷/, /護理紀錄/, /護理記錄/, /記錄於/, /紀錄於/]
    }),
    mod({
      id: 'care-handover',
      name: '交班與異常通報',
      families: ['clinical'],
      level: 'AUG',
      levelWhy: '交班草稿可以收，漏了哪個病人要人看，通報由人發出。',
      trigger: '交班，或出現需要通報的異常',
      output: '交班草稿與待通報清單',
      inputs: ['本班已知的異常、待辦與病人', '單位的通報條件'],
      steps: [
        ['AI 做', '把已知的異常與待辦收成交班草稿'],
        ['人核准', '有沒有漏掉病人，以及哪些真的要通報'],
        ['人做', '口頭交班與正式通報']
      ],
      accept: '草稿裡的每一筆都能對回本班紀錄；不在來源裡的病人沒有被寫進去。',
      risks: ['把尚未確認的異常寫成已通報'],
      patterns: [/交班/, /通報/, /異常/]
    }),
    mod({
      id: 'care-edu',
      name: '病患衛教',
      families: ['clinical'],
      level: 'AUG',
      levelWhy: '說明稿可以起草，適不適合這個病人要人判斷，當面衛教由人做。',
      trigger: '需要向病患或家屬說明照護內容',
      output: '尚未交付的衛教草稿',
      inputs: ['醫囑或衛教單', '這個病人被允許知道的範圍'],
      steps: [
        ['AI 做', '依已給的衛教單起草說明'],
        ['人核准', '內容是否適合這個病人'],
        ['人做', '當面衛教']
      ],
      accept: '草稿沒有超出已給的衛教單；不能確定的句子被標出來。',
      risks: ['寫進這個病人不適用的注意事項'],
      patterns: [/衛教/]
    }),
    mod({
      id: 'eng-build',
      name: '功能實作與程式變更',
      families: ['engineering'],
      level: 'AUG',
      levelWhy: '修改可以起草，合併與上線要人審查。',
      trigger: '有一個範圍講得清楚的功能或缺陷要改',
      output: '變更說明、最小修改與測試結果',
      inputs: ['需求或缺陷描述', '驗收條件', '不能改的範圍'],
      steps: [
        ['AI 做', '列出改動範圍與驗收條件'],
        ['人核准', '範圍是否正確'],
        ['AI 做', '起草最小修改與測試'],
        ['人做', '審查、合併與上線']
      ],
      accept: '變更有測試或明確的手動確認；沒有順手改任務外的地方。',
      risks: ['測試本身是錯的卻被當成通過', '把秘密寫進程式或提示'],
      patterns: [/程式開發/, /軟體開發/, /撰寫程式/, /程式碼/, /實作功能/, /開發功能/, /\bapi\b/i, /後端/, /前端開發/, /修 bug/i, /缺陷/, /\b(build|develop|implement|ship|write|maintain|deliver)\w*\b.{0,60}\b(feature|service|system|software|code|application|pipeline|platform|tool|infrastructure|api|model)s?\b/i, /debug|troubleshoot|bug ?fix|fix(ing)? bugs/i]
    }),
    mod({
      id: 'eng-review',
      name: '程式審查與測試',
      families: ['engineering'],
      level: 'AUG',
      levelWhy: '審查意見可以起草，能不能合併要人決定。',
      trigger: '有一份變更要審查，或要補測試',
      output: '風險清單與缺的測試',
      inputs: ['變更內容', '現有測試', '團隊的合併條件'],
      steps: [
        ['AI 做', '列出風險與少了的測試'],
        ['人做', '決定要不要退回或合併']
      ],
      accept: '每一點意見都指得到具體變更；沒有把風格偏好說成缺陷。',
      risks: ['只看摘要、沒看實際變更就建議合併'],
      patterns: [/code review/i, /程式審查/, /撰寫測試/, /寫測試/, /單元測試/, /測試案例/, /code reviews?/i, /\b(unit|integration|automated|end-to-end|e2e)\b.{0,12}tests?/i, /test (coverage|plans?|cases?|automation)/i, /writ\w+ tests/i]
    }),
    mod({
      id: 'eng-design',
      name: '系統設計',
      families: ['engineering'],
      level: 'HUMAN-LEAD',
      levelWhy: '選項可以整理，架構由人拍板。',
      trigger: '要在幾種做法裡選一個系統設計',
      output: '選項對照，不含已經拍板的結論',
      inputs: ['限制、流量或資料邊界', '不能退讓的條件'],
      steps: [
        ['AI 做', '把限制與選項列成對照'],
        ['人做', '拍板架構']
      ],
      accept: '對照裡的每個限制都來自分享的材料，沒有補上沒提過的容量數字。',
      risks: ['把其中一個選項寫成已經決定'],
      patterns: [/系統設計/, /系統架構/, /架構設計/, /技術選型/, /system design/i, /\barchitect(ure|ing)?\b/i, /technical design/i, /design docs?/i]
    }),
    mod({
      id: 'content-draft',
      name: '內容起草',
      families: ['content'],
      level: 'AUG',
      levelWhy: '草稿可以交，事實、語氣與發布要人核准。',
      trigger: '有 brief，要產出還沒發布的文案或貼文',
      output: '內容草稿',
      inputs: ['受眾、目的與不能講的話', '可以引用的事實來源'],
      steps: [
        ['AI 做', '依 brief 起草，不新增沒有來源的數字'],
        ['人核准', '事實與語氣'],
        ['人做', '發布']
      ],
      accept: '草稿裡的事實都回得去來源；沒有來源的句子被標成待確認。',
      risks: ['補上沒核實的成效數字', '用草稿直接發布'],
      patterns: [/文案/, /貼文/, /腳本/, /社群文/, /內容起草/, /\bcopy(writing)?\b/i, /\bblogs?\b/i, /social (media )?posts?/i, /newsletter/i, /(write|draft|create|produce)\w*.{0,40}\b(content|articles?|scripts?|messaging|case studies)\b/i, /content creation/i]
    }),
    mod({
      id: 'content-cal',
      name: '內容檔期',
      families: ['content'],
      level: 'AUG',
      levelWhy: '檔期表可以排，題目與檔期要人定。',
      trigger: '要排一段時間的內容題目',
      output: '內容檔期表',
      inputs: ['這段期間的主題與不能撞期的日子', '已確定的活動'],
      steps: [
        ['AI 做', '把已知活動排成檔期表，空的日子留白'],
        ['人核准', '題目與日期'],
        ['人做', '定案']
      ],
      accept: '表上的每一格不是空的就是有來源；沒有活動被填上去充數。',
      risks: ['為了填滿日曆而發明沒有的活動'],
      patterns: [/檔期/, /內容日曆/, /內容規劃/, /內容排程/, /編輯日曆/, /(content|editorial|campaign|marketing) (calendar|plans?|roadmap)/i]
    }),
    mod({
      id: 'hr-hire',
      name: '招募與面試安排',
      families: ['hr'],
      level: 'AUG',
      levelWhy: '職缺整理與邀約草稿可以交，錄用由人決定。',
      trigger: '要開一個職缺或安排面試',
      output: '職缺條件整理與邀約草稿',
      inputs: ['用人主管給的條件', '可面試的時段', '還沒有決定的條件'],
      steps: [
        ['AI 做', '把條件與可約時段整理成清單'],
        ['人核准', '條件是否可以對外'],
        ['AI 做', '起草邀約，不寫尚未決定的薪資'],
        ['人做', '面試與錄用']
      ],
      accept: '對外文字沒有出現還沒核准的薪資或職等。',
      risks: ['把希望條件寫成已經承諾的待遇'],
      patterns: [/招募/, /面試/, /刊登職缺/, /履歷/, /任用/, /邀約/, /recruit/i, /\bsourc(e|ing)\b/i, /interview/i, /candidates?\b/i, /job (posting|description)s?/i, /\bhiring\b/i]
    }),
    mod({
      id: 'hr-pay',
      name: '薪資與出勤',
      families: ['hr'],
      level: 'HUMAN-LEAD',
      levelWhy: '表可以整理，每一筆金額與發薪要人核准。',
      trigger: '到了算出勤或薪資的週期',
      output: '出勤或薪資核對表',
      inputs: ['出勤原始紀錄', '計薪規則', '需要另外處理的名單'],
      steps: [
        ['AI 做', '把出勤整理成表，缺資料的列標出來'],
        ['人核准', '每一筆金額與例外'],
        ['人做', '發薪']
      ],
      accept: '表上沒有原始紀錄的時數沒有被補零充數；金額有人簽過才算出完成。',
      risks: ['缺卡被自動補成正常出勤'],
      patterns: [/薪資/, /出勤/, /勞健保/, /計薪/, /發薪/, /payroll/i, /attendance/i, /benefits administration/i]
    }),
    mod({
      id: 'ops-buy',
      name: '採購與比價',
      families: ['ops'],
      level: 'AUG',
      levelWhy: '比較表可以收，供應商與金額要人核准後才下單。',
      trigger: '有採購需求，要比較之後才買',
      output: '比價表',
      inputs: ['需求規格與數量', '已收到的報價', '可以決定的金額上限'],
      steps: [
        ['AI 做', '把需求與報價整理成比較表'],
        ['人核准', '供應商與金額'],
        ['人做', '下單與驗收']
      ],
      accept: '表上的價格都來自己收到的報價；沒有報價的欄位是空的。',
      risks: ['補上一間沒有報過價的廠商'],
      patterns: [/採購/, /請購/, /比價/, /供應商/, /庶務用品/, /procure/i, /purchas(e|ing) orders?/i, /\b(vendor|supplier)s?\b/i, /\brf[pq]s?\b/i]
    }),
    mod({
      id: 'ops-doc',
      name: '行政文件',
      families: ['ops'],
      level: 'AUG',
      levelWhy: '格式可以排，用印與外發要人核准。',
      trigger: '要處理公文、用印或歸檔',
      output: '文件草稿與缺件清單',
      inputs: ['文件用途與收件人', '現有本文', '用印規則'],
      steps: [
        ['AI 做', '依現有本文排成草稿，並列出缺的附件'],
        ['人核准', '內容、用印與是否外發'],
        ['人做', '用印、寄出與歸檔']
      ],
      accept: '草稿沒有改寫還沒核准的承諾；缺的附件被標出來。',
      risks: ['還沒用印就視為可以外發'],
      patterns: [/公文/, /用印/, /歸檔/, /行政文件/, /文件歸檔/]
    }),
    mod({
      id: 'support-reply',
      name: '客戶問題回覆',
      families: ['support'],
      level: 'AUG',
      levelWhy: '回覆草稿可以交；退款、補償與例外處理要人核准。',
      trigger: '客戶來電、來信或在線上提問',
      output: '回覆草稿，以及這一案的處理紀錄',
      inputs: ['客戶的原話與訂單或帳號資料', '可以答應的範圍：退款、補償、時效', '常見問題與標準回覆'],
      steps: [
        ['AI 做', '把問題歸類，找出對應的標準回覆並改成這位客戶的情況'],
        ['人核准', '退款、補償、例外處理'],
        ['人做', '送出回覆；電話與情緒激動的客戶由人接'],
        ['AI 做', '把處理過程寫成案件紀錄']
      ],
      accept: '回覆沒有答應權限以外的事；案件紀錄看得出問題、處理方式與結果。',
      risks: ['答應了公司沒有的政策', '把還在查的事說成已解決'],
      patterns: [/respon(d|se|ding)\w* to .{0,30}(customer|client|user|inquir|ticket|contact)/i, /customer (inquir|contact|question|issue|complaint|request|concern)/i, /\btickets?\b/i, /(resolve|troubleshoot|handle)\w* .{0,40}(customer|issue|problem|inquir)/i, /(phone|email|chat).{0,30}(support|contact|customer|inquir)/i, /回覆客戶|客訴|客服|來電|來信|線上客服|客戶問題|退換貨|退款/]
    }),
    mod({
      id: 'support-escalate',
      name: '案件升級與問題回報',
      families: ['support'],
      level: 'AUG',
      levelWhy: '彙整與分類可以交；要不要升級、升級給誰要人判斷。',
      trigger: '有一案第一線處理不了，或同一種問題反覆出現',
      output: '給下一關的升級單，或一份重複問題的彙整',
      inputs: ['案件紀錄', '升級條件與對口單位', '這段期間的案件清單'],
      steps: [
        ['AI 做', '把案件整理成對方看得懂的升級單：現象、已試過的做法、客戶要什麼'],
        ['人核准', '是不是真的要升級，以及升級給誰'],
        ['AI 做', '把同類案件歸在一起，算出次數'],
        ['人做', '跟對口單位追進度，回覆客戶']
      ],
      accept: '升級單不用回頭問第一線就能接手；彙整裡每一類都附得出案件編號。',
      risks: ['把個案寫成普遍問題', '升級單漏掉客戶已經試過的步驟'],
      patterns: [/escalat/i, /document\w* .{0,40}(case|interaction|issue|step|resolution)/i, /(identify|report|track)\w* .{0,30}(trends?|recurring|root cause)/i, /log(ging)? (cases|tickets|calls|contacts)/i, /通報|升級|案件紀錄|問題回報|彙整.{0,6}問題|異常回報/]
    }),
    mod({
      id: 'support-kb',
      name: '常見問題與知識庫',
      families: ['support'],
      level: 'AUG',
      levelWhy: '文件草稿可以交；內容對不對、能不能公開要人核准。',
      trigger: '同一個問題被問了很多次，或流程改了',
      output: '一篇常見問題或內部教學文件的草稿',
      inputs: ['已經解決的案件與當時的回覆', '現行流程或政策', '文件的讀者：客戶或內部同仁'],
      steps: [
        ['AI 做', '把已解決的案件寫成問題、步驟、注意事項'],
        ['人核准', '步驟是否正確、有沒有不能公開的內容'],
        ['人做', '上架，並通知第一線']
      ],
      accept: '照文件做得出結果；沒有寫進任何一位客戶的個人資料。',
      risks: ['把舊流程寫進新文件', '案件裡的個資沒拿掉'],
      patterns: [/knowledge base/i, /help (center|articles?)/i, /\bfaqs?\b/i, /\bmacros?\b/i, /canned responses?/i, /training (material|document)/i, /team documentation/i, /常見問題|知識庫|教學文件|話術|教育訓練教材/]
    }),
    mod({
      id: 'logistics-kpi',
      name: '營運指標與班次報表',
      families: ['logistics'],
      level: 'AUG',
      levelWhy: '數字彙整可以交；異常的原因與要採取的行動要人判斷。',
      trigger: '每班、每日或每週要回報營運表現',
      output: '指標對目標的報表，以及落後項目的清單',
      inputs: ['系統匯出的產量、時效、品質、安全數字', '各項指標的目標值', '這段期間的異常紀錄'],
      steps: [
        ['AI 做', '把數字對上目標，標出落後與突然變動的項目'],
        ['人做', '到現場確認落後的原因'],
        ['AI 做', '把原因與已採取的行動寫進報表'],
        ['人核准', '報表送出前確認數字與說法']
      ],
      accept: '每個數字都對得回系統匯出；落後項目都有原因或標成待查。',
      risks: ['替落後的數字編一個沒人確認過的原因', '不同班次的數字口徑不同卻直接相比'],
      patterns: [/\bkpis?\b/i, /\bmetrics\b/i, /performance (reports?|reviews?|against|targets?)/i, /productivity (reports?|plans?|rates?|requirements)/i, /(daily|shift|weekly) reports?/i, /scorecard/i, /營運報表|績效指標|日報|達成率|營運數據/]
    }),
    mod({
      id: 'logistics-improve',
      name: '流程改善與標準作業',
      families: ['logistics'],
      level: 'AUG',
      levelWhy: '資料整理與文件草稿可以交；改哪裡、怎麼改要人決定並到現場驗證。',
      trigger: '同一個異常反覆發生，或要把做法寫成標準作業',
      output: '一份問題分析（現象、原因、對策），或一份標準作業文件草稿',
      inputs: ['異常紀錄與發生的時間、站點', '現行作業步驟', '現場觀察或訪談筆記'],
      steps: [
        ['AI 做', '把異常依時間、站點、類型整理，列出可能原因'],
        ['人做', '到現場確認真正的原因'],
        ['AI 做', '把對策與新步驟寫成文件草稿'],
        ['人核准', '新作業步驟，以及安全上有沒有疑慮']
      ],
      accept: '每個原因都有紀錄或現場觀察支持；新步驟現場的人照著做得出來。',
      risks: ['只看紀錄就下結論，沒到現場確認', '新步驟漏掉安全規定'],
      patterns: [/process improvements?/i, /continuous improvement/i, /root.?causes?/i, /\blean\b/i, /kaizen/i, /six sigma/i, /standard work/i, /\bsops?\b/i, /deep.?dives?/i, /operational excellence/i, /流程改善|標準作業|異常分析|優化流程|作業流程/]
    }),
    mod({
      id: 'logistics-plan',
      name: '排班、產能與庫存規劃',
      families: ['logistics'],
      level: 'AUG',
      levelWhy: '試算可以交；排班牽涉到人，庫存牽涉到錢，都要人核准。',
      trigger: '要排下一期的人力、車次或庫存',
      output: '排班或補貨的試算表，附上用了哪些假設',
      inputs: ['需求預估或訂單量', '可用人力、車輛、儲位', '限制：工時法規、安全庫存、交期'],
      steps: [
        ['AI 做', '依需求與限制算出人力、車次或補貨量'],
        ['AI 做', '標出不夠或過剩的時段與品項'],
        ['人核准', '排班表、加班與補貨量'],
        ['人做', '通知人員與供應商']
      ],
      accept: '每個數字都看得到算法與假設；沒有違反工時或安全庫存的排法。',
      risks: ['排出違反工時規定的班表', '把預估當成確定的訂單'],
      patterns: [/labou?r plan/i, /staffing/i, /capacity plan/i, /shift (plan|schedul)/i, /\bscheduling\b/i, /headcount plan/i, /inventory (plan|levels?|control|accuracy|management)/i, /demand plan/i, /route plan/i, /replenish/i, /排班|產能|庫存|盤點|調度|補貨|配送規劃/]
    }),
    mod({
      id: 'design-draft',
      name: '設計稿與規格',
      families: ['design'],
      level: 'AUG',
      levelWhy: '初稿與多個版本可以交；方向、品牌與最後定稿要人決定。',
      trigger: '有一個畫面、流程或素材要設計',
      output: '設計初稿或幾個方向，以及交給工程或印製的規格',
      inputs: ['需求與使用情境', '品牌與設計規範', '尺寸、平台與技術限制'],
      steps: [
        ['人做', '定方向與要解決的問題'],
        ['AI 做', '照方向出幾個版本，並把規格整理成清單'],
        ['人核准', '選定版本、修到能交付'],
        ['AI 做', '依定稿整理標註與切圖清單']
      ],
      accept: '定稿符合設計規範；規格清單工程或廠商不用回頭問。',
      risks: ['用了沒有授權的圖片或字型', '版本好看但沒解決原本的問題'],
      patterns: [/wireframes?/i, /prototyp/i, /mock-?ups?/i, /user flows?/i, /visual design/i, /design (concepts?|solutions?|deliverables|specs?|specifications)/i, /interaction design/i, /key art/i, /\bgraphics\b/i, /\blayouts?\b/i, /設計稿|視覺設計|介面設計|排版|原型|主視覺|平面設計/]
    }),
    mod({
      id: 'design-research',
      name: '使用者研究整理',
      families: ['design'],
      level: 'AUG',
      levelWhy: '逐字稿整理與歸類可以交；訪談本身與結論要人做。',
      trigger: '做完一輪訪談或易用性測試',
      output: '研究發現的整理：觀察、出現幾次、原話',
      inputs: ['訪談逐字稿或測試錄影的筆記', '這輪研究要回答的問題', '受訪者背景'],
      steps: [
        ['人做', '訪談與測試'],
        ['AI 做', '把筆記依主題歸類，每一點附原話與出現次數'],
        ['人核准', '哪些算發現、優先順序怎麼排'],
        ['AI 做', '寫成給團隊看的摘要']
      ],
      accept: '每個發現都附得出原話；沒有把一個人的意見寫成多數人的看法。',
      risks: ['把研究者自己的推測寫成受訪者說的', '受訪者的個資沒拿掉'],
      patterns: [/user research/i, /usability/i, /user (interviews?|testing|feedback)/i, /research (findings|insights|studies)/i, /customer insights?/i, /使用者研究|易用性|使用者訪談|使用者回饋/]
    }),
    mod({
      id: 'design-system',
      name: '設計規範與元件庫',
      families: ['design'],
      level: 'AUG',
      levelWhy: '文件與清單可以交；規範本身的決定要人做。',
      trigger: '新增或修改元件，或發現各處做法不一致',
      output: '元件的使用說明，或一份不一致之處的清單',
      inputs: ['現行設計規範', '新元件或修改的內容', '目前產品裡的實際用法'],
      steps: [
        ['AI 做', '比對現行用法與規範，列出不一致的地方'],
        ['人核准', '要改規範還是改產品'],
        ['AI 做', '寫元件說明：什麼時候用、什麼時候不用']
      ],
      accept: '說明裡的例子都在產品裡找得到；清單每一項都指得出位置。',
      risks: ['把一次性的做法寫成規範'],
      patterns: [/design systems?/i, /style guides?/i, /component librar/i, /pattern librar/i, /design (guidelines|standards|patterns)/i, /brand (guidelines|standards)/i, /設計規範|設計系統|元件庫|品牌規範/]
    }),
    mod({
      id: 'product-spec',
      name: '需求文件與規劃',
      families: ['product'],
      level: 'AUG',
      levelWhy: '文件草稿可以交；做什麼、不做什麼、先後順序要人決定。',
      trigger: '有一個新需求或新產品要寫成文件',
      output: '需求文件草稿：問題、對象、範圍、驗收條件',
      inputs: ['客戶或使用者的原始回饋與數據', '目標與限制：時程、資源、法規', '相關單位的意見'],
      steps: [
        ['AI 做', '把回饋與數據整理成問題陳述與幾個做法'],
        ['人核准', '選哪個做法、範圍切到哪裡'],
        ['AI 做', '寫成需求文件，列出驗收條件與未決事項'],
        ['人做', '跟工程、設計與主管對過，定案']
      ],
      accept: '每個需求都有驗收條件；文件裡的數據都附得出來源。',
      risks: ['把假設寫成已驗證的客戶需求', '漏列未決事項，讓人以為都定了'],
      patterns: [/requirements/i, /\bprds?\b/i, /user stories/i, /product (specs?|vision|strategy|roadmap)/i, /\broadmaps?\b/i, /business cases?/i, /working backwards/i, /需求文件|產品規劃|產品規格|路線圖|企劃書/]
    }),
    mod({
      id: 'product-track',
      name: '專案進度與風險追蹤',
      families: ['product'],
      level: 'AUG',
      levelWhy: '彙整進度可以交；延期、砍範圍與向上回報的說法要人決定。',
      trigger: '每週要更新專案進度，或有項目延誤',
      output: '進度更新：做完什麼、落後什麼、風險與需要誰決定',
      inputs: ['專案計畫與里程碑', '各負責人回報的狀態', '上一期的風險與待辦'],
      steps: [
        ['AI 做', '把各人回報對上里程碑，標出落後與卡住的項目'],
        ['人做', '找落後項目的負責人確認原因與新日期'],
        ['AI 做', '寫成進度更新，列出要誰做什麼決定'],
        ['人核准', '送出前確認說法']
      ],
      accept: '每個落後項目都有負責人與新日期，或標成待確認；沒有把沒回報的項目寫成正常。',
      risks: ['沒人回報的項目被當成沒問題', '替延誤編原因'],
      patterns: [/project plans?/i, /\btimelines?\b/i, /\bmilestones?\b/i, /status (reports?|updates?)/i, /track\w* (progress|deliverables|action items|projects?)/i, /risks? (and|&) (issues|dependencies|mitigation)/i, /program (execution|delivery|management)/i, /launch (plans?|readiness)/i, /end-to-end .{0,20}programs?/i, /專案進度|時程|里程碑|風險追蹤|專案管理|進度追蹤/]
    }),
    mod({
      id: 'data-analysis',
      name: '資料分析與發現',
      families: ['data'],
      level: 'AUG',
      levelWhy: '查詢與初步分析可以交；問題怎麼定義、結論能不能下要人判斷。',
      trigger: '有人帶著一個業務問題來要數字',
      output: '分析結果：問題、用了哪些資料、發現、限制',
      inputs: ['要回答的問題與決策情境', '資料表與欄位定義', '時間範圍與排除條件'],
      steps: [
        ['人做', '跟提問的人確認問題與口徑'],
        ['AI 做', '寫查詢、跑數字、做初步圖表'],
        ['人核准', '查詢邏輯與口徑有沒有錯'],
        ['AI 做', '寫成發現與限制，區分資料顯示的與推測的']
      ],
      accept: '每個數字都重跑得出來；結論沒有超出資料能支持的範圍。',
      risks: ['把相關寫成因果', '口徑跟既有報表不同卻沒說明'],
      patterns: [/analy[sz](e|es|is|ing)\b/i, /\binsights?\b/i, /\bsql\b/i, /a\/b test/i, /\bexperiments?\b/i, /statistical/i, /hypothes/i, /deep.?dives?/i, /資料分析|數據分析|洞察|統計分析/]
    }),
    mod({
      id: 'data-report',
      name: '報表與儀表板',
      families: ['data'],
      level: 'AUG',
      levelWhy: '報表與查詢可以交；指標定義要跟業務單位定案。',
      trigger: '固定要出的報表，或要新做一個儀表板',
      output: '報表或儀表板，附指標定義與資料來源',
      inputs: ['要看的指標與定義', '資料來源與更新頻率', '讀報表的人要拿它做什麼決定'],
      steps: [
        ['人核准', '指標定義'],
        ['AI 做', '寫查詢、排版面、加上資料更新時間'],
        ['AI 做', '跟既有報表對數字，列出對不上的地方'],
        ['人做', '確認對不上的原因，上線']
      ],
      accept: '同一個指標跟既有報表對得上，或差異有說明；每張圖都標了資料時間。',
      risks: ['同名指標定義不同', '資料沒更新卻沒人發現'],
      patterns: [/dashboards?/i, /\breport(s|ing)\b/i, /visuali[sz]ation/i, /tableau|quicksight|power ?bi|looker/i, /metrics? definitions?/i, /\betl\b/i, /data (pipelines?|models?|warehous\w+|quality|solutions?)/i, /報表|儀表板|視覺化|資料倉儲/]
    }),
    mod({
      id: 'legal-contract',
      name: '合約審閱與起草',
      families: ['legal'],
      level: 'HUMAN-LEAD',
      levelWhy: '法律判斷與談判由法務負責；AI 只做比對、標示與初稿。',
      trigger: '收到一份合約要審，或要依範本起草',
      output: '條款比對表（哪裡偏離範本），或依範本填好的初稿',
      inputs: ['對方版本或要用的範本', '公司的標準條款與可讓步的範圍', '這筆交易的背景'],
      steps: [
        ['AI 做', '逐條對照範本，標出偏離與缺漏'],
        ['人做', '判斷哪些能接受、怎麼改'],
        ['AI 做', '依法務的決定改成修訂版'],
        ['人核准', '送出前逐條確認']
      ],
      accept: '每一處偏離都被標出來；修訂版沒有法務沒決定過的改動。',
      risks: ['漏標一條不利的條款', '把範本條款當成對方已同意'],
      patterns: [/(draft|review|negotiat)\w* .{0,60}(contracts?|agreements?|terms|ndas?)/i, /contract (review|drafting|management|negotiation)s?/i, /commercial agreements?/i, /\bcontracts?\b/i, /合約|契約|條款|保密協議/]
    }),
    mod({
      id: 'legal-research',
      name: '法規研究與合規追蹤',
      families: ['legal'],
      level: 'HUMAN-LEAD',
      levelWhy: '法律意見由法務出；AI 只整理條文與出處。',
      trigger: '業務單位問一件事能不能做，或法規有更新',
      output: '相關條文與函釋的整理，附出處與日期',
      inputs: ['要回答的問題與事實', '適用的法域', '公司既有的政策'],
      steps: [
        ['AI 做', '找出相關條文，逐條附出處與生效日期'],
        ['人做', '查證條文是否現行有效，形成法律意見'],
        ['AI 做', '把法務的意見寫成業務單位看得懂的說明'],
        ['人核准', '送出前確認']
      ],
      accept: '每一條都附得出官方出處；沒有引用已廢止的條文。',
      risks: ['引用不存在或已修正的條文', '把整理寫得像正式法律意見'],
      patterns: [/legal research/i, /regulat/i, /\bcompliance\b/i, /\bpolic(y|ies)\b/i, /legal (advice|guidance|risks?|issues|frameworks?)/i, /counsel\w* .{0,30}(business|clients?|teams?)/i, /\bprivacy\b/i, /litigation/i, /法規|法遵|合規|法律意見|訴訟|個資/]
    }),
    mod({
      id: 'fin-ap',
      name: '應付、應收與請款',
      families: ['finance'],
      level: 'AUG',
      levelWhy: '比對與清單可以交；付款與沖帳要人核准。',
      trigger: '收到發票、請款單，或到了付款與催收日',
      output: '核對過的付款清單，或逾期應收的催收清單',
      inputs: ['發票、採購單與驗收單', '付款條件與核決權限', '銀行入帳明細'],
      steps: [
        ['AI 做', '發票、採購單、驗收單三方比對，標出對不上的'],
        ['人核准', '付款清單'],
        ['AI 做', '把入帳明細對上應收，列出沒對到的與逾期的'],
        ['人做', '付款、催收、處理爭議']
      ],
      accept: '付款清單每一筆都有三張單據；沒對到的款項都列出來，沒有被硬配。',
      risks: ['重複付款', '把金額相近的款項配錯客戶'],
      patterns: [/accounts? (payable|receivable)/i, /\binvoic/i, /payment (processing|runs?)/i, /vendor payments?/i, /cash application/i, /\bcollections\b/i, /expense reports?/i, /應付|應收|請款|付款|發票|核銷|費用報銷/]
    }),
    mod({
      id: 'fin-audit',
      name: '稽核、內控與稅務申報',
      families: ['finance'],
      level: 'AUG',
      levelWhy: '資料準備與底稿可以交；判斷與簽核要人負責。',
      trigger: '到了稽核、內控測試或申報期',
      output: '底稿或申報資料的草稿，附每個數字的來源',
      inputs: ['查核或申報要的項目清單', '帳載資料與憑證', '上一期的底稿與調整'],
      steps: [
        ['AI 做', '依清單把資料備齊，標出缺件'],
        ['AI 做', '把數字填進底稿，附來源'],
        ['人核准', '會計與稅務上的判斷'],
        ['人做', '簽核、申報、回覆查核人員']
      ],
      accept: '底稿每個數字都對得回帳載；缺件都列出來。',
      risks: ['用錯稅率或申報期間', '把沒有憑證的金額填進去'],
      patterns: [/\baudits?\b/i, /internal controls?/i, /\bsox\b/i, /tax (returns?|filings?|compliance|provision)/i, /statutory/i, /due diligence/i, /稽核|內控|查帳|稅務|申報|扣繳/]
    }),
    mod({
      id: 'it-ticket',
      name: '資訊設備報修與故障排除',
      families: ['it'],
      level: 'AUG',
      levelWhy: '查手冊、列步驟可以交；動到機器與權限的操作要人做。',
      trigger: '有人報修，或監控跳出異常',
      output: '排查步驟與處理紀錄',
      inputs: ['報修內容與錯誤訊息', '設備與系統的基本資料', '既有的處理手冊'],
      steps: [
        ['AI 做', '依錯誤訊息找出可能原因，排出由簡到難的檢查步驟'],
        ['人做', '實際檢查與動手處理'],
        ['人核准', '更換設備、重設權限、停機'],
        ['AI 做', '把處理過程寫成紀錄']
      ],
      accept: '紀錄看得出現象、原因、做了什麼；沒有跳過要核准的操作。',
      risks: ['建議的步驟會造成資料遺失', '沒確認身分就重設權限'],
      patterns: [/troubleshoot/i, /help ?desk/i, /\btickets?\b/i, /technical support/i, /(install|configur|deploy|repair|replace)\w* .{0,40}(hardware|software|devices?|servers?|network|equipment|laptops?)/i, /break.?fix/i, /\bracks?\b/i, /cabling/i, /故障排除|報修|安裝設定|維修|帳號權限/]
    }),
    mod({
      id: 'safety-inspect',
      name: '安全巡檢與事故紀錄',
      families: ['safety'],
      level: 'HUMAN-LEAD',
      levelWhy: '巡檢與事故調查要人到現場；AI 只整理紀錄與報表。',
      trigger: '例行巡檢，或發生事故與虛驚事件',
      output: '巡檢紀錄或事故報告的草稿',
      inputs: ['巡檢項目表', '現場照片與筆記', '當事人與目擊者的陳述'],
      steps: [
        ['人做', '現場巡檢、訪談'],
        ['AI 做', '把筆記整理成紀錄：時間、地點、發現、照片編號'],
        ['人核准', '原因判定與改善措施'],
        ['人做', '依法通報、追蹤改善']
      ],
      accept: '紀錄裡每一項發現都對得上照片或筆記；原因欄沒有人判定前保持空白。',
      risks: ['替事故編原因', '漏掉法定通報期限'],
      patterns: [/inspections?/i, /safety audits?/i, /risk assessments?/i, /\bhazards?\b/i, /incident (investigations?|reports?)/i, /near.?miss/i, /\binjur(y|ies)\b/i, /巡檢|稽查|風險評估|事故|職災|危害/]
    }),
    mod({
      id: 'safety-train',
      name: '安全訓練與法規追蹤',
      families: ['safety'],
      level: 'AUG',
      levelWhy: '教材與名冊可以交；訓練內容對不對、法規怎麼適用要人確認。',
      trigger: '新人到職、定期複訓，或法規更新',
      output: '訓練教材草稿與應訓名冊',
      inputs: ['適用的法規與公司規定', '人員名冊與上次受訓日期', '近期的事故與巡檢發現'],
      steps: [
        ['AI 做', '依名冊算出誰該受訓，列出逾期的人'],
        ['AI 做', '依規定與近期事故寫教材草稿'],
        ['人核准', '教材內容與法規引用'],
        ['人做', '上課、簽到、留存紀錄']
      ],
      accept: '名冊對得上人事資料；教材引用的規定都是現行版本。',
      risks: ['引用已修正的法規', '名冊漏掉派遣或承攬人員'],
      patterns: [/safety training/i, /training (programs?|sessions?|materials?|and certification)/i, /toolbox/i, /health and safety programs?/i, /regulatory requirements?/i, /\bosha\b/i, /教育訓練|安全宣導|安全衛生|法規要求/]
    }),
    mod({
      id: 'cross-notes',
      name: '週報與會議紀錄',
      families: ['general'],
      cross: true,
      level: 'AUG',
      levelWhy: '紀錄可以起草，決定事項要人確認後才算出數。',
      trigger: '開完會，或該交週報',
      output: '會議紀錄或週報草稿',
      inputs: ['已經發生的討論、決定與待辦', '固定的週報格式'],
      steps: [
        ['AI 做', '只把已發生的事收成草稿'],
        ['人核准', '決定事項有沒有寫錯'],
        ['人做', '送出']
      ],
      accept: '每一條決定都對得回筆記；沒討論到的事項沒有被寫進去。',
      risks: ['把還沒決定的事寫成已決議'],
      patterns: [/會議紀錄/, /週報/, /例行週報/, /meeting (notes|minutes)/i, /(weekly|status|progress) reports?/i]
    })
  ];

  var SAMPLES = [
    {
      id: 'finance',
      label: '財務分析師',
      text: 'Finance Business Partner\n\nResponsibilities:\n- Finance POC providing day-to-day operational support for local business teams and cross-functional partners around the globe; strategic partner to the business and finance leadership.\n- Carry out the financial planning process for key functions: develop near and long-term budget plans at the project-level, monitor budget implementation, carry out month-end close responsibilities, and update the forecast periodically by working closely with business teams.\n- Responsible for optimizing practices, policies, programs, and procedures; constantly improve finance processes by leading efforts to simplify and automate reporting wherever possible (e.g. self-serve dashboards for the business).\n- Partner with business units and provide insightful and quality financial advice to support company business decision-making; prepare management reporting and present variance analysis to senior leadership at a regular cadence.\n- Conduct ad-hoc projects/analyses, develop innovative reporting to track KPIs, and support industry analysis.\n\nQualifications:\n- 5+ years of Corporate Finance/FP&A experience.\n- Data analysis, financial modeling, Excel, PPT, G Suite; Tableau and Power BI a plus.'
    },
    {
      id: 'sales',
      label: '業務專員',
      text: '業務專員\n\n工作內容：\n1. 開發新客戶，並經營既有客戶關係\n2. 撰寫報價單，追蹤訂單進度與收款\n3. 每週提交銷售預測與業績回報\n4. 參加產業展會，收集名片並於會後跟進\n5. 跨部門溝通，協調內部資源與客訴\n\n任職要求：\n- 一年以上業務經驗\n- 熟悉 Excel'
    },
    {
      id: 'nurse',
      label: '護理師',
      text: '病房護理師\n\n工作內容：\n1. 執行入院護理評估與生命徵象量測\n2. 依醫囑給藥與治療處置，給藥前完成核對\n3. 即時將護理過程記錄於病歷\n4. 向病患與家屬做衛教\n5. 交班並通報異常\n6. 維繫護病關係，回應情緒需求\n\n條件要求：\n- 護理師執照\n- 具病房經驗佳'
    }
  ];

  var BULLET = /^([-•*・●▪◦–]|\d{1,2}\s*[.、．)）]|[（(]\d{1,2}[)）]|[一二三四五六七八九十]{1,2}\s*[、.．])\s*/;
  // 小標分三種：職責、條件、其他（福利、公司介紹、應徵流程）。只有職責底下的條列才算工作內容。
  var HEAD_RESP = /responsibilit|what you(?:'ll| will) (?:do|be doing|work on|own|achieve)|^you will\b|^you'll\b|a typical day|typical day|a day in the life|in this role|key duties|^duties|your (?:role|impact|mission|responsibilities)|the difference you will make|about the (?:role|job|position)|^the role|job description|what you(?:'ll| will) be|職責|工作內容|職務說明|職務內容|工作項目|主要工作|工作說明|你將|你會|妳將|你的任務|你的工作/i;
  var HEAD_QUAL = /qualif|requirement|what you(?:'ll| will) (?:bring|need)|what you bring|you have|about you|who you are|your (?:expertise|skills|background|experience|profile)|love to hear|looking for|what we seek|must.?haves?|nice.?to.?haves?|preferred|added plus|helpful experience|exceptional candidates|minimum|essential|desired|bonus|條件|資格|加分|必備|正在找|擁有以下|技能|具備|我們希望你|應徵條件|任職要求/i;
  var HEAD_OTHER = /benefit|perks|compensation|salary|\bpay\b|supports?\b|accommodat|why (?:you|join|this)|about (?:us|the team|the company|gitlab|figma|airbnb)|how we|our (?:team|values|culture|commitment)|equal opportunity|location|examples of our projects|待遇|福利|薪資|注意事項|應徵流程|合作方式|為什麼|關於我們|公司介紹|面試流程/i;
  var SOFT = /關係|客情|情緒|跨部門|溝通|協調|合作|配合|態度|抗壓|學習意願|責任感|其他交辦|主管交辦|團隊合作|接待|訪客|總機|適應|輔導|關懷|\bcollaborat|\bpartner with\b|cross-functional|\bmentor|build (?:strong )?relationships|stakeholder/i;

  function cleanHeading(line) {
    return String(line)
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/^[^A-Za-z0-9一-鿿]+/, '')
      .replace(/[\s:：.…。!！?？\]】)）]+$/, '')
      .trim();
  }

  function headingKind(line) {
    var text = cleanHeading(line);
    if (!text || text.length > 70) return '';
    // 以句號結尾的是句子，不是小標（例如「You will build the billing service.」）。
    if (/[.。]\s*$/.test(String(line))) return 'unknown';
    // 順序有意義：「what you'll bring」同時像職責也像條件，先判條件與其他。
    if (HEAD_OTHER.test(text)) return 'other';
    if (HEAD_QUAL.test(text)) return 'qual';
    if (HEAD_RESP.test(text)) return 'resp';
    return 'unknown';
  }

  // 沒有條列符號的長段落拆成句子，免得整段被當成一條職責。
  function splitProse(line) {
    if (line.length <= 220) return [line];
    var parts = line.match(/[^.。!?！？]+(?:[.。!?！？]+|$)/g) || [line];
    var out = [];
    parts.forEach(function (part) {
      part = part.trim();
      if (!part) return;
      if (out.length && (part.length < 25 || out[out.length - 1].length < 25)) out[out.length - 1] += ' ' + part;
      else out.push(part);
    });
    return out;
  }

  function parseJD(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').map(function (line) {
      return line.trim();
    }).filter(Boolean);
    var title = (lines[0] || '未命名職位').replace(/^(職稱|職位|job title)\s*[:：]\s*/i, '');
    if (headingKind(title) === 'resp' || headingKind(title) === 'qual') title = '未命名職位';
    title = title.replace(/^#+\s*/, '').slice(0, 80);

    // 先把每一條條列標上它所屬小標的種類。
    var items = [];
    var kind = 'unknown';
    var sawResp = false;
    lines.forEach(function (line, index) {
      if (index === 0) return;
      if (BULLET.test(line)) {
        var item = line.replace(BULLET, '').trim();
        if (item) items.push({ text: item, kind: kind });
        return;
      }
      var next = lines[index + 1] || '';
      var k = headingKind(line);
      if (k === 'resp' || k === 'qual' || k === 'other') {
        kind = k;
        if (k === 'resp') sawResp = true;
        return;
      }
      // 認不得、但後面緊跟條列的短行，當成不明小標。
      if (k === 'unknown' && BULLET.test(next) && line.length <= 40) {
        kind = 'unknown';
        return;
      }
      // 職責小標底下沒有條列符號的行也算職責。有的 JD 本來就不用條列，有的是貼上時符號掉了。
      if (kind === 'resp' && line.length >= 12 && !/^null$/i.test(line)) {
        splitProse(line).forEach(function (part) {
          items.push({ text: part, kind: 'resp' });
        });
      }
    });

    var resp = items.filter(function (item) {
      // 有認得的職責小標：只收它底下的。沒有：收不是條件也不是福利的條列。
      return sawResp ? item.kind === 'resp' : item.kind === 'unknown';
    }).map(function (item) { return item.text; });

    if (!resp.length && !items.length) {
      resp = lines.slice(1).filter(function (line) {
        return line.length > 18 && headingKind(line) === 'unknown' || line.length > 70;
      }).slice(0, 10);
    }
    return { title: title || '未命名職位', responsibilities: resp, sawResp: sawResp };
  }

  var NOT_DUTY = /^(stand|walk|lift|push|pull|bend|reach|climb|squat)\b.{0,80}(hours?|pounds|lbs|kg)|work in an environment (where|that)|climb and descend|work flexible shifts|noise level|temperature (may|can|varies)|(medical|dental|vision),? .{0,30}(coverage|insurance)|parental leave|401\s?\(?k\)?|paid time off|employee discounts?|體力負荷|需輪班|配合加班|久站/i;

  function isQualification(line) {
    if (NOT_DUTY.test(line)) return true;
    var skill = /學歷|科系|執照|證照|年以上|years of|\d\+\s*years|熟悉|精通|加分|優先考慮|本科|碩士|學士|不拘/i.test(line);
    var work = /撰寫|製作|產出|負責|執行|追蹤|紀錄|記錄|評估|給藥|報價|開發|分析|預算|預測|交班|衛教|採購|面試|歸檔/.test(line);
    if (skill && !work) return true;
    if (/[一-鿿]/.test(line)) return false;
    return /^(\d\+?\s*years|at least \d|bachelor|master|ph\.?d|degree|experience (with|in|working)|proven|proficien|fluen|familiarity|knowledge of|strong (understanding|knowledge|communication)|excellent|ability to|track record|you (have|are)|comfortable)/i.test(line);
  }

  function familyHits(text) {
    return FAMILIES.map(function (family) {
      var re = new RegExp(family.re.source, family.re.flags.indexOf('g') === -1 ? family.re.flags + 'g' : family.re.flags);
      var count = 0;
      while (re.exec(text)) {
        count += 1;
        if (count > 12) break;
      }
      return { id: family.id, count: count };
    }).filter(function (item) {
      return item.count > 0;
    }).sort(function (a, b) {
      return b.count - a.count;
    });
  }

  function pickFamilies(ranked) {
    if (!ranked.length) return [];
    var top = ranked[0].count;
    return ranked.filter(function (item) {
      return item.count * 2 >= top;
    }).map(function (item) {
      return item.id;
    });
  }

  function scoreModule(line, module) {
    var score = 0;
    module.patterns.forEach(function (pattern) {
      if (pattern.test(line)) score += 1;
    });
    return score;
  }

  function humanReason(line) {
    if (SOFT.test(line)) return '沒有單獨的產出與驗收，屬於關係、協調或現場接待，簡單版不把它做成模組。';
    return '對不上這版收得到的工作模組。可能是句型還沒涵蓋，或這條本身不是一件可交接的工作。';
  }

  function quote(line) {
    return '「' + String(line).replace(/\s+/g, ' ').trim() + '」';
  }

  function moduleMarkdown(module) {
    var lines = [];
    lines.push('# ' + module.name);
    lines.push('');
    lines.push('## 這個模組在做什麼');
    lines.push('');
    lines.push(module.trigger + '時，交出' + module.output + '。');
    lines.push('');
    lines.push('對應 JD 原文：');
    lines.push('');
    module.bullets.forEach(function (bullet) {
      lines.push('- ' + quote(bullet));
    });
    lines.push('');
    lines.push('## 可取代程度');
    lines.push('');
    lines.push(module.level + '。' + module.levelWhy);
    lines.push('');
    lines.push('## 輸入');
    lines.push('');
    lines.push('下面是這類工作通常要準備的東西，JD 沒寫到的不當作事實。');
    lines.push('');
    module.inputs.forEach(function (item) {
      lines.push('- ' + item);
    });
    lines.push('');
    lines.push('## 步驟');
    lines.push('');
    module.steps.forEach(function (step, index) {
      lines.push((index + 1) + '. ' + step[0] + '：' + step[1]);
    });
    lines.push('');
    lines.push('## 交付物與驗收');
    lines.push('');
    lines.push('- 產出：' + module.output);
    lines.push('- 驗收：' + module.accept);
    lines.push('');
    lines.push('## 風險與人工把關');
    lines.push('');
    module.risks.forEach(function (risk) {
      lines.push('- ' + risk);
    });
    lines.push('- 若上面引用的原文其實不是這件事，拿掉這份，不要硬用。');
    lines.push('');
    lines.push('## 給 AI 的指令（可直接貼）');
    lines.push('');
    lines.push('```');
    lines.push(module.prompt);
    lines.push('```');
    lines.push('');
    return lines.join('\n');
  }

  function buildPrompt(module) {
    var quoted = module.bullets.map(function (bullet) {
      return '- ' + quote(bullet);
    }).join('\n');
    return [
      '你協助完成「' + module.name + '」這一件工作。只使用我提供的材料。材料沒寫的數字、承諾、劑量、價格與原因，保持空白並標成待確認。',
      '',
      '何時開始：' + module.trigger + '。',
      '要交出：' + module.output + '。',
      '可取代程度：' + module.level + '。' + module.levelWhy,
      '',
      '原 JD 只包含這幾句：',
      quoted,
      '',
      '每一步用「AI 做」「人核准」或「人做」起頭。人核准與人做的步驟，停下來等我，不要自己做完。',
      '開始前先問我還缺哪些輸入。'
    ].join('\n');
  }

  function humanMarkdown(items) {
    var lines = ['# 仍然需要你本人', '', '這些職責沒有收成工作模組。', ''];
    items.forEach(function (item) {
      lines.push('- ' + quote(item.text));
      lines.push('  - 原因：' + item.reason);
    });
    lines.push('');
    return lines.join('\n');
  }

  function fileName(index, name) {
    var safe = String(name).replace(/[\\/:*?"<>|]/g, '－').replace(/\s+/g, '');
    var prefix = index < 10 ? '0' + index : String(index);
    return prefix + '-' + safe + '.md';
  }

  function combinedMarkdown(result) {
    var lines = [];
    lines.push('# ' + result.title + '：JD2MD 工作模組');
    lines.push('');
    lines.push('> 簡單版在瀏覽器內依職責句型歸併，未經模型改寫。不會為了湊數補上無關模組。請先核對每一節引用的 JD 原文。');
    lines.push('');
    if (result.source) lines.push('- 來源：' + result.source);
    lines.push('- 模組：' + (result.modules.length ? result.modules.map(function (item) { return item.name; }).join('、') : '沒有收成模組'));
    lines.push('- 留給你本人：' + result.human.length + ' 條');
    lines.push('');
    result.modules.forEach(function (item) {
      lines.push('---');
      lines.push('');
      lines.push(item.markdown.trim());
      lines.push('');
    });
    if (result.human.length) {
      lines.push('---');
      lines.push('');
      lines.push(humanMarkdown(result.human).trim());
      lines.push('');
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function emptyResult(title, message) {
    return {
      ok: false,
      error: message,
      title: title || '未命名職位',
      families: [],
      modules: [],
      human: [],
      skipped: [],
      files: [],
      markdown: ''
    };
  }

  function convert(text, options) {
    options = options || {};
    var raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return emptyResult('', '請貼上 JD 全文。');
    if (raw.length > MAX_CHARS) return emptyResult('', '超過 ' + MAX_CHARS.toLocaleString('zh-Hant') + ' 字。請只留職稱與工作內容。');

    var parsed = parseJD(raw);
    if (!parsed.responsibilities.length) {
      return emptyResult(parsed.title, '找不到工作內容。請用條列寫出職責，或把「工作內容」小標留著。');
    }

    var byTitle = titleFamily(parsed.title);
    var families = byTitle
      ? [byTitle]
      : pickFamilies(familyHits(parsed.responsibilities.join('\n')).filter(function (item) { return item.count >= 2; }));
    var familyModules = MODULES.filter(function (item) {
      return !item.cross && item.families.some(function (family) { return families.indexOf(family) !== -1; });
    });
    var crossModules = MODULES.filter(function (item) { return item.cross; });

    var buckets = {};
    var human = [];
    var skipped = [];
    familyModules.concat(crossModules).forEach(function (item) {
      buckets[item.id] = [];
    });

    parsed.responsibilities.forEach(function (line) {
      if (isQualification(line)) {
        skipped.push(line);
        return;
      }
      var hits = familyModules.map(function (item) {
        return { module: item, score: scoreModule(line, item) };
      }).filter(function (item) { return item.score > 0; });
      if (!hits.length) {
        hits = crossModules.map(function (item) {
          return { module: item, score: scoreModule(line, item) };
        }).filter(function (item) { return item.score > 0; });
      }
      if (!hits.length) {
        human.push({ text: line, reason: humanReason(line) });
        return;
      }
      hits.sort(function (a, b) { return b.score - a.score; });
      var best = hits[0].score;
      hits.filter(function (item) { return item.score === best; }).forEach(function (item) {
        buckets[item.module.id].push(line);
      });
    });

    function firstBullet(item) {
      var best = 9999;
      buckets[item.id].forEach(function (line) {
        var index = parsed.responsibilities.indexOf(line);
        if (index !== -1 && index < best) best = index;
      });
      return best;
    }
    var ranked = familyModules.concat(crossModules).filter(function (item) {
      return buckets[item.id].length > 0;
    }).sort(function (a, b) {
      return buckets[b.id].length - buckets[a.id].length || firstBullet(a) - firstBullet(b);
    });
    var dropped = ranked.slice(MAX_MODULES);
    ranked = ranked.slice(0, MAX_MODULES).sort(function (a, b) {
      return firstBullet(a) - firstBullet(b);
    });
    dropped.forEach(function (item) {
      buckets[item.id].forEach(function (line) {
        var stillKept = ranked.some(function (other) {
          return buckets[other.id].indexOf(line) !== -1;
        });
        if (!stillKept) human.push({ text: line, reason: '簡單版最多 6 個模組，這條先留給你本人。' });
      });
    });

    var modules = ranked.map(function (item) {
      var copy = {
        id: item.id,
        name: item.name,
        level: item.level,
        levelWhy: item.levelWhy,
        trigger: item.trigger,
        output: item.output,
        inputs: item.inputs.slice(),
        steps: item.steps.map(function (step) { return step.slice(); }),
        accept: item.accept,
        risks: item.risks.slice(),
        bullets: buckets[item.id].slice()
      };
      copy.prompt = buildPrompt(copy);
      copy.markdown = moduleMarkdown(copy);
      return copy;
    });

    var files = modules.map(function (item, index) {
      return { filename: fileName(index + 1, item.name), markdown: item.markdown };
    });
    if (human.length) files.push({ filename: fileName(files.length + 1, '仍然需要你本人'), markdown: humanMarkdown(human) });

    var result = {
      ok: true,
      error: modules.length ? '' : '這份 JD 沒有收成可交接的模組。職責可能寫成特質，或這個職業的句型還沒涵蓋。',
      title: parsed.title,
      families: families,
      modules: modules,
      human: human,
      skipped: skipped,
      files: files,
      source: options.source || '',
      markdown: ''
    };
    result.markdown = combinedMarkdown(result);
    return result;
  }

  function crcTable() {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }
  var CRC_TABLE = crcTable();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function buildZip(files) {
    var encoder = new TextEncoder();
    var locals = [];
    var central = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.filename);
      var data = encoder.encode(String(file.markdown || '').replace(/\n/g, '\r\n'));
      var crc = crc32(data);
      var local = new Uint8Array(30 + name.length + data.length);
      var view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0x6000, true);
      view.setUint16(12, 0x5d73, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      locals.push(local);

      var entry = new Uint8Array(46 + name.length);
      var cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0x6000, true);
      cv.setUint16(14, 0x5d73, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry);
      offset += local.length;
    });
    var centralSize = central.reduce(function (sum, entry) { return sum + entry.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    var total = offset + centralSize + eocd.length;
    var out = new Uint8Array(total);
    var cursor = 0;
    locals.concat(central).forEach(function (part) {
      out.set(part, cursor);
      cursor += part.length;
    });
    out.set(eocd, cursor);
    return out;
  }

  return {
    MAX_CHARS: MAX_CHARS,
    SAMPLES: SAMPLES,
    parseJD: parseJD,
    convert: convert,
    buildZip: buildZip
  };
});
