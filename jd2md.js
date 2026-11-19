/* JD2MD 簡單版：在瀏覽器內把一份 JD 收成工作模組 Markdown。不送出、不呼叫模型。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JD2MD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX_CHARS = 12000;
  var MAX_MODULES = 6;

  var FAMILIES = [
    { id: 'clinical', re: /護理|護士|病房|給藥|病歷|生命徵象|病患|護理師|nurse|nursing/i },
    { id: 'sales', re: /業務|銷售|報價|客戶開發|訂單|收款|展會|業績|account executive|sales rep/i },
    { id: 'finance', re: /財務|會計|預算|fp&a|月結|帳務|資金|財報|finance|budget|forecast|variance|financial/i },
    { id: 'engineering', re: /軟體|工程師|程式碼|程式開發|後端|前端|系統設計|code review|\bapi\b/i },
    { id: 'content', re: /文案|行銷|社群|品牌|內容規劃|內容日曆|行銷企劃/ },
    { id: 'hr', re: /人資|招募|薪資|面試|任用/ },
    { id: 'ops', re: /行政|採購|倉儲|總務|庶務|公文|用印/ }
  ];

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
      trigger: '收到詢價、訂單成立，或到了對帳、收款的時候',
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
      patterns: [/報價/, /訂單/, /收款/, /應收/, /對帳/, /請款/]
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
      trigger: '到了每週或每月要交銷售預測的時候',
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
      trigger: '入院、接班，或需要重新評估的時候',
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
      trigger: '有醫囑要給藥或做治療的時候',
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
      trigger: '做完照護，要寫進病歷的時候',
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
      patterns: [/程式開發/, /軟體開發/, /撰寫程式/, /程式碼/, /實作功能/, /開發功能/, /\bapi\b/i, /後端/, /前端開發/, /修 bug/i, /缺陷/]
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
      patterns: [/code review/i, /程式審查/, /撰寫測試/, /寫測試/, /單元測試/, /測試案例/]
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
      patterns: [/系統設計/, /系統架構/, /架構設計/, /技術選型/]
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
      patterns: [/文案/, /貼文/, /腳本/, /社群文/, /內容起草/]
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
      patterns: [/檔期/, /內容日曆/, /內容規劃/, /內容排程/, /編輯日曆/]
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
      patterns: [/招募/, /面試/, /刊登職缺/, /履歷/, /任用/, /邀約/]
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
      patterns: [/薪資/, /出勤/, /勞健保/, /計薪/, /發薪/]
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
      patterns: [/採購/, /請購/, /比價/, /供應商/, /庶務用品/]
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
      id: 'cross-notes',
      name: '週報與會議紀錄',
      families: ['general'],
      cross: true,
      level: 'AUG',
      levelWhy: '紀錄可以起草，決定事項要人確認後才算出數。',
      trigger: '開完會，或到了交週報的時間',
      output: '會議紀錄或週報草稿',
      inputs: ['已經發生的討論、決定與待辦', '固定的週報格式'],
      steps: [
        ['AI 做', '只把已發生的事收成草稿'],
        ['人核准', '決定事項有沒有寫錯'],
        ['人做', '送出']
      ],
      accept: '每一條決定都對得回筆記；沒討論到的事項沒有被寫進去。',
      risks: ['把還沒決定的事寫成已決議'],
      patterns: [/會議紀錄/, /週報/, /例行週報/]
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

  var BULLET = /^([-•*・]|\d{1,2}\s*[.、．)）]|[（(]\d{1,2}[)）]|[一二三四五六七八九十]{1,2}\s*[、.．])\s*/;
  var HEAD_RESP = /^(responsibilities|responsibility|what you'?ll do|職責|工作內容|工作職責|職務說明|職務內容)\s*[:：]?$/i;
  var HEAD_QUAL = /^(qualifications|requirements|minimum qualifications|preferred qualifications|資格|條件|條件要求|應徵條件|任職要求|必要條件|加分條件)\s*[:：]?$/i;
  var SOFT = /關係|客情|情緒|跨部門|溝通|協調|合作|配合|態度|抗壓|學習意願|責任感|其他交辦|主管交辦|團隊合作|接待|訪客|總機|適應|輔導|關懷/;

  function parseJD(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').map(function (line) {
      return line.trim();
    }).filter(Boolean);
    var title = (lines[0] || '未命名職位').replace(/^(職稱|職位|job title)\s*[:：]\s*/i, '');
    if (HEAD_RESP.test(title) || HEAD_QUAL.test(title)) title = '未命名職位';
    title = title.replace(/^#+\s*/, '').slice(0, 80);

    var resp = [];
    var inResp = false;
    var seenResp = false;
    lines.forEach(function (line) {
      if (HEAD_RESP.test(line)) {
        inResp = true;
        seenResp = true;
        return;
      }
      if (HEAD_QUAL.test(line)) {
        inResp = false;
        return;
      }
      if (!BULLET.test(line)) return;
      if (seenResp && !inResp) return;
      var item = line.replace(BULLET, '').trim();
      if (item) resp.push(item);
    });

    if (!resp.length) {
      resp = lines.slice(1).filter(function (line) {
        return line.length > 18 && !HEAD_RESP.test(line) && !HEAD_QUAL.test(line) && !BULLET.test(line);
      }).slice(0, 10);
    }
    return { title: title || '未命名職位', responsibilities: resp };
  }

  function isQualification(line) {
    var skill = /學歷|科系|執照|證照|年以上|years of|\d\+\s*years|熟悉|精通|加分|優先考慮|本科|碩士|學士|不拘/i.test(line);
    var work = /撰寫|製作|產出|負責|執行|追蹤|紀錄|記錄|評估|給藥|報價|開發|分析|預算|預測|交班|衛教|採購|面試|歸檔/.test(line);
    return skill && !work;
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

    var familyText = parsed.title + '\n' + parsed.responsibilities.join('\n') + '\n' + raw.slice(0, 500);
    var families = pickFamilies(familyHits(familyText));
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
