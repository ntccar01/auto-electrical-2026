const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const crypto=require('node:crypto');
function makeGAS() {
  const properties=new Map([['SPREADSHEET_ID','test-sheet'],['TEACHER_EMAILS','teacher@example.invalid'],['STUDENT_VERIFY_URL','https://script.google.com/macros/s/TEST_PUBLIC_DEPLOYMENT/exec']]);
  const sheets=new Map();let email='teacher@example.invalid',sheetAccess=0;
  function sheet(name) {
    const data=[];
    return {name,data,getLastRow:()=>data.length,appendRow(row){data.push([...row]);},deleteRow(row){data.splice(row-1,1);},getRange(row,col,count,width){return {
      getValues:()=>JSON.parse(JSON.stringify(Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>data[row-1+i]?.[col-1+j]??'')))),
      setValues(values){values.forEach((r,i)=>{data[row-1+i]??=[];r.forEach((v,j)=>data[row-1+i][col-1+j]=v);});}
    };}};
  }
  const book={getSheetByName:n=>sheets.get(n),insertSheet(n){const s=sheet(n);sheets.set(n,s);return s;}};
  const ctx={console,Date,JSON,Math,Number,Object,Set,Array,
    Session:{getActiveUser:()=>({getEmail:()=>email})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
    SpreadsheetApp:{openById:()=>{sheetAccess++;return book;}},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(raw,key)=>Array.from(crypto.createHmac('sha256',key).update(raw).digest()).map(b=>b>127?b-256:b),base64EncodeWebSafe:bytes=>Buffer.from(bytes.map(b=>b<0?b+256:b)).toString('base64url'),
      DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      computeDigest:(alg,value)=>Array.from(crypto.createHash(alg).update(value,'utf8').digest()).map(b=>b>127?b-256:b),
      base64Decode:text=>{if(!/^[A-Za-z0-9+/=]*$/.test(text))throw new Error('Could not decode string.');return Array.from(Buffer.from(text,'base64')).map(b=>b>127?b-256:b);},
      newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes.map(b=>b<0?b+256:b)).toString('utf8')})},
    HtmlService:{createHtmlOutputFromFile:file=>({file,setTitle(title){this.title=title;return this;}}),createTemplateFromFile:file=>({file,certificateId:'',evaluate(){return {file,certificateId:this.certificateId,setTitle(title){this.title=title;return this;}};}})}
  };
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8'),ctx,{filename:'Code.gs'});
  return {ctx,sheets,properties,setEmail:value=>{email=value;},sheetAccess:()=>sheetAccess};
}
function grade(id='R-one',score=60){return {recordId:id,sid:'S-one',unit:'start',cls:'TEST_A',seat:'1',paper:'A',semester:'115-1',faultConfigId:'START-S-04',summary:{score,pass:true,parts:{}}};}
module.exports={makeGAS,grade};
