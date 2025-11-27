import{j as e,K as b}from"./react-core-B8kFjp2k.js";import{C as m,f as c,g as x,b as p}from"./index-PwDgWEVM.js";const f={blue:"bg-gradient-to-br from-blue-500 to-blue-700",green:"bg-gradient-to-br from-green-500 to-emerald-700",purple:"bg-gradient-to-br from-purple-500 to-purple-700",orange:"bg-gradient-to-br from-orange-500 to-red-600",cyan:"bg-gradient-to-br from-cyan-500 to-cyan-700",pink:"bg-gradient-to-br from-pink-500 to-pink-700",indigo:"bg-gradient-to-br from-indigo-500 to-indigo-700",teal:"bg-gradient-to-br from-teal-500 to-teal-700"};function j({title:a,value:o,subtitle:t,icon:s,color:i="blue",onClick:r,className:n="","data-testid":d}){const l=f[i],g=!!r;return e.jsxs(m,{className:`
        ${l}
        text-white 
        border-0 
        overflow-hidden 
        relative
        ${g?"hover-elevate active-elevate-2 cursor-pointer":""}
        ${n}
      `,onClick:r,"data-testid":d,children:[e.jsxs(c,{className:"flex flex-row items-center justify-between gap-2 space-y-0 pb-2",children:[e.jsx(x,{className:"text-sm font-medium text-white/90",children:a}),e.jsx(s,{className:"h-5 w-5 text-white/80"})]}),e.jsxs(p,{children:[e.jsx("div",{className:"text-3xl font-bold text-white",children:o}),t&&e.jsx("p",{className:"text-xs text-white/80 mt-1",children:t})]}),e.jsx(b,{className:"absolute -right-4 -bottom-4 h-24 w-24 text-white/10"})]})}export{j as G};
