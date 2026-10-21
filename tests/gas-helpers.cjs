const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const crypto=require('node:crypto');
function makeGAS() {
  const properties=new Map([['SPREADSHEET_ID','test-sheet'],['TEACHER_EMAILS','teacher@example.invalid']]);
  const sheets=new Map();let email='teacher@example.invalid',sheetAccess=0;
  function sheet(name) {
    const data=[];
    return {name,data,getLastRow:()=>data.length,appendRow(row){data.push([...row]);},getRange(row,col,count,width){return {
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
    Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(raw,key)=>Array.from(crypto.createHmac('sha256',key).update(raw).digest()),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')},
    HtmlService:{createHtmlOutputFromFile:()=>({setTitle:()=>({})})}
  };
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8'),ctx,{filename:'Code.gs'});
  return {ctx,sheets,properties,setEmail:value=>{email=value;},sheetAccess:()=>sheetAccess};
}
function grade(id='R-one',score=60){return {recordId:id,sid:'S-one',unit:'start',cls:'TEST_A',seat:'1',paper:'A',semester:'115-1',faultConfigId:'START-S-04',summary:{score,pass:true,parts:{}}};}
module.exports={makeGAS,grade};
