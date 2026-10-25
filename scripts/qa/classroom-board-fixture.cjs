// Synthetic teaching only. Parsed by the real protocol; no provider call or student data.
exports.classroomBoardFixture = function(message = '') {
  if (!message.includes('[board-')) return {reply:'先明确条件。再比较一个新例子。最后用自己的话解释结论。',evidenceIds:[],board:{
    title:'对照条件与结论',points:['固定条件后比较例子','用自己的话检查理解'],diagram:null,table:null,formulas:[],
    anchors:{points:['明确条件','用自己的话'],tableRows:[],formulas:[]}}};
  const xss = message.includes('[board-xss]');
  return {reply:'先固定总量。第一种分法是十二颗分成三组。第二种分法是十二颗分成四组。平均每份等于总量除以份数。',evidenceIds:[],board:{
    title:'平均分的两种分法',points:['固定总量，比较份数','用总量除以份数检查每份数量'],diagram:null,
    table:{title:'同一总量的两种分法',headers:['总量','份数','每份'],rows:[[xss?'<img src=x onerror="window.__boardXss=1">':'12','3','4'],['12','4','3']]},
    formulas:[{label:'平均每份',latex:xss?String.raw`\text{<img src=x onerror=alert(1)>}`:String.raw`\bar{x}=\frac{T}{n}`,meaning:'总量除以份数，份数必须大于零。'}],
    anchors:{points:['固定总量','平均每份等于'],tableRows:['第一种分法','第二种分法'],formulas:['平均每份等于']}}};
};
