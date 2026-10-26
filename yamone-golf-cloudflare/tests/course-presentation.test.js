import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {Script} from 'node:vm';
import worker from '../src/index.ts';
import {formatCourseText,presentCourse,regionGroupSQL,viewerRegion,validateLocalization} from '../src/course-presentation.js';
const db=new DatabaseSync(':memory:');
const migrationDirectory = new URL('../migrations/', import.meta.url);
const migrations = readdirSync(migrationDirectory).filter(f => f.endsWith('.sql')).sort();
for (const file of migrations) db.exec(readFileSync(new URL(file, migrationDirectory), 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
db.prepare("INSERT INTO users(user_id,nickname,personal_code,language,recovery_hash,created_at,updated_at) VALUES('test-admin','Test Admin','TEST-ONLY','en',?,0,0)").run('0'.repeat(64));
const insertCourse=db.prepare("INSERT INTO courses(course_id,name,region,country_code,city,address,segments_json,created_by,created_at,updated_at,source_name,source_external_id,source_hash,active,managed_by_admin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
const insertCatalog=db.prepare("INSERT INTO golfcore_catalog_courses(slug,name,country_code,region,city,address,coverage_json,layouts_json,source_payload_json,source_hash,source_url,detail_state,source_retrieved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'{}','[]','{}',?,'https://example.com','full',0,0,0)");
db.exec('BEGIN');
for(let i=0;i<3686;i++){
 const id='10000000-0000-4000-8000-'+String(i).padStart(12,'0');
 const country=i<639?'KR':'PH', city=i<639?'용인시':'Manila';
 const slug='test-course-'+i, name='Test Club '+i;
 insertCourse.run(id,name,'',country,city,'',i===0?'[]':JSON.stringify([{name:'OUT',pars:Array(9).fill(4)}]),'test-admin',0,0,'golfcore',slug,'test-hash',i===0?0:1);
 insertCatalog.run(slug,name,country,'',city,'','test-hash');
}
db.exec('COMMIT');
const usedSql=[];
class Prepared {
 constructor(sql,args=[]) {this.sql=sql;this.args=args;usedSql.push(sql);}
 bind(...args){return new Prepared(this.sql,args);}
 async all(){return {results:db.prepare(this.sql).all(...this.args),success:true};}
 async first(column){const row=db.prepare(this.sql).get(...this.args);return column?row?.[column]??null:row??null;}
 async run(){const r=db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
}
const env={COURSE_ADMIN_TOKEN:'local-fixture-token-for-tests-only-123456',ENVIRONMENT:'test',DB:{prepare:sql=>new Prepared(sql),batch:async statements=>{db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
async function api(path,method='GET',body){const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Authorization:'Bearer '+env.COURSE_ADMIN_TOKEN,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,body:await r.json()};}
const sample={country_code:'TH',name:'English',address:'Address',localization:{name:{ko:'한국 이름',en:'English',local:'ชื่อไทย'},address:{ko:'한국어 주소',en:'English Address',local:'ที่อยู่'}}};
test('language orders, Korean local script, duplicate suppression, missing fields and region source',()=>{
 assert.equal(formatCourseText(sample,'name','KR'),'한국 이름(English, ชื่อไทย)');
 assert.equal(formatCourseText(sample,'name','US'),'English(ชื่อไทย)');
 assert.equal(formatCourseText({...sample,country_code:'KR'},'name','US'),'English(한국 이름)');
 assert.equal(formatCourseText({...sample,localization:{name:{ko:'골프장',en:'Club',local:'Club'}}},'name','KR'),'골프장(Club)');
 assert.equal(presentCourse({country_code:'KR',name:'남서울',address:''},'KR').display_name,'남서울');
 assert.deepEqual(presentCourse({country_code:'KR',name:'남서울'},'US').translation_missing,['name']);
 assert.equal(viewerRegion(new Request('https://test/?viewer_region=KR',{headers:{'Accept-Language':'en-US'}})),'KR');
 assert.equal(viewerRegion(new Request('https://test/',{headers:{'Accept-Language':'ko-KR'}})),'');
 assert.throws(()=>validateLocalization({name:{ko:'x'.repeat(161)},address:{}}));
});
test('Korean province groups, metropolitan distinction and ambiguous locations',()=>{
 const expression=regionGroupSQL();
 const query=db.prepare(`WITH courses(country_code,region,city,address,region_group) AS (VALUES('KR',?,?,?,?)) SELECT ${expression} AS value FROM courses`);
 for(const [city,address,expected] of [['용인시','','경기도'],['가평군','','경기도'],['Chungcheongbuk-do','','충청도'],['Jeonbuk State','','전라도'],['Gwangju','Gyeonggi-do','경기도'],['Gwangju','','미분류'],['부산광역시','','부산광역시'],['Sejong-si','','세종특별자치시'],['Gunwi-gun','','대구광역시'],['Gyeonggi-do','', '경기도']])assert.equal(query.get('',city,address,'').value,expected,city);
 assert.equal(query.get('','unknown','','경기도').value,'경기도');
});
test('admin list grouping is before pagination and counts total 639; inactive courses can save translations',async()=>{
 let r=await api('/admin/api/courses?country=KR&viewer_region=KR');assert.equal(r.status,200);assert.equal(r.body.total_count,639);
 assert.equal(r.body.courses.length,10);assert.equal(r.body.page_count,64);assert.ok(r.body.courses.every(c=>c.country_code==='KR'));
 const target=db.prepare("SELECT * FROM courses WHERE country_code='KR' AND active=0 AND segments_json='[]' LIMIT 1").get();
 const detail=await api('/admin/api/courses/'+target.course_id);assert.equal(detail.status,200);
 const c=detail.body.course;
 const localization={name:{ko:'검증 골프장',en:'Verified Golf Club',local:''},address:{ko:'검증 주소',en:'Verified Address',local:''}};
 const updated=await api('/admin/api/courses/'+c.course_id,'PUT',{...c,localization,region_group:'경기도'});assert.equal(updated.status,200,JSON.stringify(updated.body));
 assert.equal(updated.body.course.display_name,'검증 골프장(Verified Golf Club)');
 const foreign=await api('/admin/api/courses/'+c.course_id+'?viewer_region=US');assert.equal(foreign.body.course.display_name,'Verified Golf Club(검증 골프장)');
 assert.equal(foreign.body.course.display_address,'Verified Address(검증 주소)');
 assert.equal(foreign.body.course.active,false);
 assert.equal((await api('/admin/api/courses/'+c.course_id,'PUT',{...c,localization})).status,409);
 const group=await api('/admin/api/courses?country=KR&region='+encodeURIComponent('경기도'));
 assert.equal(group.status,200);assert.equal(group.body.total_count,639);
 const search=await api('/admin/api/courses?country=KR&q='+encodeURIComponent('검증 골프장'));assert.equal(search.body.courses.length,1);
 const change=db.prepare('SELECT after_json FROM course_admin_changes WHERE course_id=? ORDER BY created_at DESC LIMIT 1').get(c.course_id);assert.ok(change.after_json.includes('검증 골프장'));
 const invalid=await api('/admin/api/courses/'+c.course_id,'PUT',{...foreign.body.course,active:true});assert.equal(invalid.status,400);
});
test('catalog filtering, overview, page syntax and SQL limits',async()=>{
 const catalog=await api('/admin/api/golfcore/catalog?country=KR&region='+encodeURIComponent('경기도'));assert.equal(catalog.status,200);assert.ok(catalog.body.courses.length);assert.ok(catalog.body.courses.every(c=>c.region_group==='경기도'));
 assert.equal((await api('/admin/api/overview')).status,200);
 const response=await worker.fetch(new Request('https://test.local/admin'),env);assert.equal(response.status,200);
 const html=await response.text();const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);new Script(scripts[0][1]);
 assert.ok(scripts[0][1].indexOf('const __name = (target) => target;')<scripts[0][1].indexOf('const formatCourseText ='));
 assert.ok(html.includes('translation-name-')===false); // dynamic editors, not pre-rendered labels
 assert.ok(!html.includes('viewer-region'));assert.ok(html.includes('언어별 이름·주소'));
 assert.ok(html.includes('코스 수'));assert.ok(html.includes('미처리 요청'));assert.ok(html.includes('골프장 이름 또는 주소 검색'));assert.ok(html.includes('전체 주소'));
 assert.ok(!html.includes('주소상 지역'));assert.ok(!html.includes('시·군·구 / 도시'));
 assert.ok(!html.includes('id="open-import"'));assert.ok(html.includes('id="open-deleted"'));assert.ok(html.includes('id="deleted-view"'));
 assert.ok(!html.includes('골프장 관리 · 국가별 등록 골프장'));assert.ok(!html.includes('삭제용 Sample'));assert.ok(html.includes('custom-combo'));
 const navStart=html.indexOf('<nav class="nav-list"');const nav=html.slice(navStart,html.indexOf('</nav>',navStart));
 assert.ok(nav.indexOf('대시보드')<nav.indexOf('사용자'));assert.ok(nav.indexOf('사용자')<nav.indexOf('라운드'));assert.ok(nav.indexOf('라운드')<nav.indexOf('요구사항'));assert.ok(nav.indexOf('요구사항')<nav.indexOf('골프장'));
 assert.ok(usedSql.every(sql=>Buffer.byteLength(sql)<100000));
 console.log('SQL max bytes',Math.max(...usedSql.map(s=>Buffer.byteLength(s))));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM golfcore_catalog_courses').get().n,3686);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM courses').get().n,3686);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('country lock, country availability and course operational counts',async()=>{
 const overview=await api('/admin/api/overview');
 const kr=overview.body.countries.find(country=>country.code==='KR');
 assert.equal(kr.public_count,639);assert.equal(kr.active_count,638);assert.equal(kr.locked,true);
 assert.equal((await api('/admin/api/countries/PH','PATCH',{action:'set_enabled',enabled:false})).status,409);
 assert.equal((await api('/admin/api/countries/PH','PATCH',{action:'unlock',confirmation:'wrong'})).status,400);
 assert.equal((await api('/admin/api/countries/PH','PATCH',{action:'unlock',confirmation:'잠금해제'})).status,200);
 assert.equal((await api('/admin/api/countries/PH','PATCH',{action:'set_enabled',enabled:false})).body.country.enabled,false);
 assert.equal((await api('/admin/api/countries/PH','PATCH',{action:'lock'})).body.country.locked,true);
 const course=db.prepare("SELECT course_id,name,segments_json FROM courses WHERE country_code='PH' ORDER BY course_id LIMIT 1").get();
 db.prepare("INSERT INTO rounds(round_id,creator_id,join_code,course_snapshot,hole_count,status,created_at,updated_at) VALUES('20000000-0000-4000-8000-000000000001','test-admin','ROUNDTEST1',?,18,'ended',0,0)").run(JSON.stringify({course_id:course.course_id,name:course.name,segments:JSON.parse(course.segments_json)}));
 db.prepare("INSERT INTO course_requests(request_id,requester_id,course_id,category,description,status,created_at,updated_at) VALUES('30000000-0000-4000-8000-000000000001','test-admin',?,'other','test request','pending',0,0)").run(course.course_id);
 const list=await api('/admin/api/courses?country=PH&q='+encodeURIComponent(course.name));
 assert.equal(list.body.courses[0].round_count,1);assert.equal(list.body.courses[0].open_request_count,1);
});
test('course deletion requires the phrase, moves to trash, and restores the original state',async()=>{
 const course=db.prepare("SELECT course_id,name,active FROM courses WHERE country_code='PH' AND active=1 ORDER BY course_id LIMIT 1").get();
 assert.equal((await api('/admin/api/courses/'+course.course_id,'DELETE',{confirmation:'삭제'})).status,400);
 const removed=await api('/admin/api/courses/'+course.course_id,'DELETE',{confirmation:'골프장 삭제'});
 assert.equal(removed.status,200);assert.equal(removed.body.recoverable,true);
 assert.equal(db.prepare('SELECT active FROM courses WHERE course_id=?').get(course.course_id).active,0);
 const normal=await api('/admin/api/courses?country=PH&q='+encodeURIComponent(course.name));
 assert.ok(normal.body.courses.every(item=>item.course_id!==course.course_id));
 const deleted=await api('/admin/api/courses/deleted?country=PH&q='+encodeURIComponent(course.name));
 assert.equal(deleted.status,200);assert.equal(deleted.body.courses.length,1);assert.equal(deleted.body.courses[0].previous_active,true);
 const restored=await api('/admin/api/courses/'+course.course_id+'/restore','PATCH');
 assert.equal(restored.status,200);assert.equal(restored.body.course.active,true);
 assert.equal((await api('/admin/api/courses/deleted?country=PH&q='+encodeURIComponent(course.name))).body.total_count,0);
});
test('world grouping uses country-scoped exact matches and preserves unknowns',()=>{
 const query=db.prepare(`WITH courses(country_code,region,city,address,region_group) AS (VALUES(?,?,?,?,?)) SELECT ${regionGroupSQL()} AS value FROM courses`);
 for(const [cc,city,expected] of [['JP','Konosu','Saitama'],['CN','Lanzhou','Gansu'],['MY','Butterworth','Penang'],['PH','Cavite','CALABARZON'],['TH','Sattahip','Chonburi'],['TW','Linkou District','New Taipei'],['VN','Hoa Binh','Phu Tho'],['ID','Lhokseumawe','Aceh'],['TH','Vientiane','미분류'],['CN','Mandalay','미분류'],['JP','unknown','미분류'],['CN','Konosu','미분류']]) {
  assert.equal(query.get(cc,'',city,'','').value,expected,cc+':'+city);
 }
 assert.equal(query.get('JP','','Konosu','','Tokyo').value,'Tokyo');
 assert.equal(query.get('VN','Hoa Binh','','','').value,'Phu Tho');
 assert.equal(query.get('TH','','Not Bangkok suburb','','').value,'미분류');
 const before=db.prepare('SELECT COUNT(*) n FROM course_region_mappings').get().n;
 db.exec(readFileSync(new URL('../migrations/0011_course_region_mappings.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM course_region_mappings').get().n,before);
});
test('foreign admin and catalog filters, explicit override, and cross-country validation',async()=>{
 const list=await api('/admin/api/courses?country=PH&region=NCR');
 assert.equal(list.status,200);assert.ok(list.body.courses.length>0);
 assert.equal(list.body.total_count,3047);assert.ok(list.body.courses.every(c=>c.country_code==='PH'));
 const catalog=await api('/admin/api/golfcore/catalog?country=PH&region=NCR');
 assert.equal(catalog.status,200);assert.ok(catalog.body.courses.length>0);
 const c=(await api('/admin/api/courses/'+list.body.courses[0].course_id)).body.course;
 assert.equal((await api('/admin/api/courses/'+c.course_id,'PUT',{...c,region_group:'Tokyo'})).status,400);
 let r=await api('/admin/api/courses/'+c.course_id,'PUT',{...c,region_group:'CALABARZON'});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.course.region_group,'CALABARZON');
 r=await api('/admin/api/courses/'+c.course_id,'PUT',{...r.body.course,region_group:''});
 assert.equal(r.status,200);assert.equal(r.body.course.region_group,'');
});
test('admin course list survives optional count and region mapping query failures',async()=>{
 db.exec('DROP TABLE rounds; DROP TABLE course_region_mappings;');
 const list=await api('/admin/api/courses?country=PH');
 assert.equal(list.status,200);assert.equal(list.body.courses.length,10);assert.ok(list.body.courses.every(course=>course.round_count===0));
 assert.equal((await api('/admin/api/overview')).status,200);
});


test('additive recovery migrations preserve existing users, courses, favorites and round snapshots', () => {
 const original = new DatabaseSync(':memory:');
 for (const file of migrations.filter(f => f < '0010')) original.exec(readFileSync(new URL(file, migrationDirectory), 'utf8'));
 original.exec("PRAGMA foreign_keys=ON");
 original.prepare("INSERT INTO users(user_id,nickname,personal_code,language,recovery_hash,created_at,updated_at) VALUES('existing-user','Existing','EXISTING','en',?,1,1)").run('2'.repeat(64));
 original.prepare("INSERT INTO courses(course_id,name,region,segments_json,created_by,created_at,updated_at) VALUES('existing-course','Existing Course','Original Region',?,'existing-user',1,1)").run(JSON.stringify([{name:'OUT',pars:Array(9).fill(4)}]));
 original.exec("INSERT INTO user_courses(user_id,course_id,sort_order) VALUES('existing-user','existing-course',0)");
 const snapshot = JSON.stringify({name:'Original snapshot',segments:[{name:'OUT',pars:Array(9).fill(4)}]});
 original.prepare("INSERT INTO rounds(round_id,creator_id,join_code,course_snapshot,hole_count,status,created_at,updated_at) VALUES('existing-round','existing-user','EXIST1',?,9,'active',1,1)").run(snapshot);
 for (const file of migrations.filter(f => f >= '0010')) original.exec(readFileSync(new URL(file, migrationDirectory), 'utf8'));
 assert.equal(original.prepare('SELECT nickname FROM users').get().nickname,'Existing');
 assert.equal(original.prepare('SELECT name FROM courses').get().name,'Existing Course');
 assert.equal(original.prepare('SELECT region FROM courses').get().region,'Original Region');
 assert.equal(original.prepare('SELECT COUNT(*) n FROM courses').get().n,1);
 assert.equal(original.prepare('SELECT COUNT(*) n FROM user_courses').get().n,1);
 assert.equal(original.prepare('SELECT course_snapshot FROM rounds').get().course_snapshot,snapshot);
 assert.deepEqual(original.prepare('PRAGMA foreign_key_check').all(),[]);
 original.close();
});
