import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDay,inJobPeriod,summarizeJobs} from './jobSummary.js';
test('job summaries reflect a completed field job without another statistics read',()=>{
 const now=new Date(2026,10,15,12),jobs=[{id:'a',date:'2026-11-15',status:'scheduled',totalCost:100},{id:'b',date:'2026-11-16',status:'en-route',totalCost:50}];
 assert.equal(summarizeJobs(jobs,now).activeJobs,2);const completed=summarizeJobs([{...jobs[0],status:'completed'},jobs[1]],now);assert.equal(completed.activeJobs,1);assert.equal(completed.completedJobs,1);assert.equal(completed.monthRevenue,100);
});
test('calendar date summaries exclude other months and do not shift a service date to UTC',()=>{
 const now=new Date(2026,10,15,12),date=calendarDay('2026-11-15');assert.equal(date.getFullYear(),2026);assert.equal(date.getMonth(),10);assert.equal(date.getDate(),15);
 assert.equal(inJobPeriod({date:'2026-11-15'},'today',now),true);assert.equal(inJobPeriod({date:'2026-11-14'},'today',now),false);assert.equal(inJobPeriod({date:'2026-12-15'},'month',now),false);assert.equal(calendarDay('2026-02-30'),null);
 const summary=summarizeJobs([{date:'2026-11-15',status:'completed',totalCost:100},{date:'2026-12-15',status:'completed',totalCost:200}],now);assert.equal(summary.thisMonthJobs,1);assert.equal(summary.monthRevenue,100);assert.equal(summary.totalRevenue,300);
});
