export function calendarDay(value) {
  const parts=typeof value==='string'&&/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(parts){const[year,month,day]=parts.slice(1).map(Number),date=new Date(0);date.setHours(12,0,0,0);date.setFullYear(year,month-1,day);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;}
  try{const date=typeof value?.toDate==='function'?value.toDate():value==null||value===''?null:new Date(value);return date&&Number.isFinite(date.getTime())?date:null;}catch{return null;}
}
export function jobDateRange(filter,now=new Date()){
  const start=new Date(now),end=new Date(now);start.setHours(0,0,0,0);end.setHours(23,59,59,999);
  if(filter==='week'){start.setDate(start.getDate()-start.getDay());end.setDate(start.getDate()+6);}
  else if(filter==='month'){start.setDate(1);end.setMonth(start.getMonth()+1,0);}
  return{startDate:start,endDate:end};
}
export function inJobPeriod(job,period,now=new Date()){
  if(period==='all')return true;const date=calendarDay(job?.date);if(!date)return false;
  const{startDate,endDate}=jobDateRange(period,now);return date>=startDate&&date<=endDate;
}
export function summarizeJobs(jobs=[],now=new Date()){
  const result={totalJobs:jobs.length,scheduledJobs:0,inProgressJobs:0,completedJobs:0,cancelledJobs:0,totalRevenue:0,thisWeekJobs:0,thisMonthJobs:0,activeJobs:0,monthRevenue:0};
  for(const job of jobs){
    if(job.status==='scheduled')result.scheduledJobs++;
    if(job.status==='in-progress')result.inProgressJobs++;
    if(job.status==='completed')result.completedJobs++;
    if(['cancelled','canceled'].includes(job.status))result.cancelledJobs++;
    if(['scheduled','en-route','in-progress'].includes(job.status))result.activeJobs++;
    if(inJobPeriod(job,'week',now))result.thisWeekJobs++;
    if(inJobPeriod(job,'month',now))result.thisMonthJobs++;
    if(job.status==='completed'){const amount=Number(job.totalCost)||0;result.totalRevenue+=amount;if(inJobPeriod(job,'month',now))result.monthRevenue+=amount;}
  }
  return result;
}
