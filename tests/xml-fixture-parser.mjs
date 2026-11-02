// Test-only XML parser for the pinned, trusted FlightGear fixtures. It rejects
// DTDs and external entities and does not access the network.
class XmlElement {
 constructor(tagName,attributes=Object.create(null)){this.tagName=tagName;this.attributes=attributes;this.children=[];this.content=[];}
 get textContent(){return this.content.map(item=>typeof item==='string'?item:item.textContent).join('');}
 getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
}
function decodeXml(text){
 const predefined={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
 return text.replace(/&([^;]*);|&/g,(reference,name)=>{
  if(name&&Object.hasOwn(predefined,name))return predefined[name];
  let value;
  if(/^#\d+$/.test(name||''))value=Number(name.slice(1));
  else if(/^#x[\da-f]+$/i.test(name||''))value=parseInt(name.slice(2),16);
  else throw Error(`Invalid XML entity: ${reference}`);
  if(!Number.isInteger(value)||!(value===9||value===10||value===13||value>=0x20&&value<=0xd7ff||value>=0xe000&&value<=0xfffd||value>=0x10000&&value<=0x10ffff))throw Error(`Invalid XML character: ${reference}`);
  return String.fromCodePoint(value);
 });
}
export function parseXml(xml){
 const s=String(xml).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');let i=0,root=null;const stack=[];
 const whitespace=()=>{const start=i;while(/[\t\n ]/.test(s[i]||''))i++;return i>start;};
 const name=()=>{const match=/^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(s.slice(i));if(!match)throw Error(`Invalid XML name at ${i}`);i+=match[0].length;return match[0];};
 const append=text=>{if(stack.length)stack.at(-1).content.push(text);else if(text.trim())throw Error('Text outside XML root');};
 while(i<s.length){
  if(s[i]!=='<'){const end=s.indexOf('<',i),stop=end<0?s.length:end,text=s.slice(i,stop);if(text.includes(']]>'))throw Error('Unexpected CDATA terminator');append(decodeXml(text));i=stop;continue;}
  if(s.startsWith('<!--',i)){const end=s.indexOf('-->',i+4);if(end<0||s.slice(i+4,end).includes('--'))throw Error('Invalid XML comment');i=end+3;continue;}
  if(s.startsWith('<![CDATA[',i)){const end=s.indexOf(']]>',i+9);if(end<0||!stack.length)throw Error('Invalid XML CDATA');append(s.slice(i+9,end));i=end+3;continue;}
  if(s.startsWith('<?',i)){const end=s.indexOf('?>',i+2);if(end<0)throw Error('Unclosed XML processing instruction');i=end+2;continue;}
  if(s.startsWith('<!',i))throw Error('XML declarations and DTDs are unsupported');
  if(s.startsWith('</',i)){
   i+=2;const closing=name();whitespace();if(s[i++]!=='>')throw Error('Invalid XML closing tag');
   if(!stack.length||stack.pop().tagName!==closing)throw Error(`Mismatched XML closing tag: ${closing}`);continue;
  }
  i++;const tag=name(),attributes=Object.create(null);let selfClosing=false;
  for(;;){
   const spaced=whitespace();
   if(s.startsWith('/>',i)){i+=2;selfClosing=true;break;}
   if(s[i]==='>'){i++;break;}
   if(!spaced)throw Error('XML attributes must be separated by whitespace');
   const key=name();if(Object.hasOwn(attributes,key))throw Error(`Duplicate XML attribute: ${key}`);
   whitespace();if(s[i++]!=='=')throw Error(`Missing XML attribute value: ${key}`);whitespace();
   const quote=s[i++];if(quote!=="'"&&quote!=='"')throw Error(`Unquoted XML attribute: ${key}`);
   const end=s.indexOf(quote,i);if(end<0)throw Error(`Unclosed XML attribute: ${key}`);
   const value=s.slice(i,end);if(value.includes('<'))throw Error(`Invalid XML attribute: ${key}`);
   attributes[key]=decodeXml(value);i=end+1;
  }
  const element=new XmlElement(tag,attributes);
  if(stack.length){stack.at(-1).children.push(element);stack.at(-1).content.push(element);}
  else{if(root)throw Error('Multiple XML roots');root=element;}
  if(!selfClosing)stack.push(element);
 }
 if(!root||stack.length)throw Error('Missing or unclosed XML root');
 const findParserError=node=>node.tagName==='parsererror'?node:node.children.map(findParserError).find(Boolean)||null;
 return {documentElement:root,querySelector:selector=>selector==='parsererror'?findParserError(root):null};
}
