import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const { initializeFocusVisibility } = await server.ssrLoadModule('/src/ui/focusVisibility.ts');
await server.close();

test('native select pointer confirmation preserves pointer focus, keyboard and virtual activation remain visible',()=>{
  class Element {
    constructor(tag){this.tag=tag;this.attributes=new Set();}
    matches(selector){return selector.split(', ').includes(this.tag);}
    closest(selector){return this.tag===selector?this:null;}
    setAttribute(name){this.attributes.add(name);}
    removeAttribute(name){this.attributes.delete(name);}
  }
  const oldElement=globalThis.Element,oldHTMLElement=globalThis.HTMLElement;
  globalThis.Element=Element;globalThis.HTMLElement=Element;
  const listeners=new Map(),select=new Element('select'),button=new Element('button');
  const document={activeElement:select,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
  const emit=(type,data={})=>listeners.get(type)?.({target:document.activeElement,...data});
  const marked=()=>select.attributes.has('data-pointer-focus');
  const cleanup=initializeFocusVisibility(document);
  try {
    emit('pointerdown');emit('focusin');
    emit('click',{isTrusted:true,detail:0});
    assert.equal(marked(),true,'native pointer confirmation must not restore outline');
    emit('keydown',{key:'Tab'});
    assert.equal(marked(),false,'keyboard navigation must restore outline');
    emit('click',{isTrusted:true,detail:0});assert.equal(marked(),false);
    emit('pointerdown');emit('focusout');document.activeElement=button;emit('focusin');
    document.activeElement=select;emit('focusin');emit('click',{isTrusted:true,detail:0});
    assert.equal(marked(),false,'new virtual activation must not inherit old pointer selection');
  } finally {cleanup();globalThis.Element=oldElement;globalThis.HTMLElement=oldHTMLElement;}
});
