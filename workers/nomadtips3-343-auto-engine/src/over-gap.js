const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export function currentGoalTotal(score){const home=finite(score?.home??score?.[0]),away=finite(score?.away??score?.[1]);return home===null||away===null?null:home+away;}
export function overLineGap(line,score){const n=finite(line),total=currentGoalTotal(score);if(n===null||total===null||!Number.isInteger(n*4))return null;const gap=Number((n-total).toFixed(2));return gap<0?null:gap;}
export function overGapPass(line,score,maxGap){const gap=overLineGap(line,score),limit=finite(maxGap);return gap!==null&&limit!==null&&(limit===999||gap<=limit);}
