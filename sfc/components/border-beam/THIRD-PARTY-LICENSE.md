# Third-party notice: border-beam

`border-beam.js` and `border-beam.css` adapt the technique of Magic UI's BorderBeam component
(https://magicui.design/docs/components/border-beam, source
`apps/www/registry/magicui/border-beam.tsx` in https://github.com/magicuidesign/magicui):

- a layer over the card, masked down to its border band
- a gradient streak inside it that rides `offset-path: rect(...)`, moved by `offset-distance`

What changed here: plain CSS and vanilla JS in place of React, Tailwind and Motion. The position is
written from a seekable GSAP timeline rather than an infinite Motion loop. The ring mask uses
`exclude` instead of `intersect`. The streak is a long, short bar instead of a square, colors come from
`--sfc-*` theme variables, and there is an optional second beam half a lap behind.

The original license follows.

---

MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
