/**
 * This file is prebuilt from packages/astro/src/runtime/client/visible.ts
 * Do not edit this directly, but instead edit that file and rerun the prebuild
 * to generate this file.
 */
declare const _default: "(()=>{var l=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let a of e)if(a.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=l;window.dispatchEvent(new Event(\"astro:visible\"));})();";
export default _default;