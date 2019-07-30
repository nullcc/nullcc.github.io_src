class X {
  a: number;
  b: string;

  constructor() {
    this.a = null;
    this.b = null;
  }
}
console.log(Object.getOwnPropertyNames(new X())); // [ 'a', 'b' ]

// class Y {
//   c: boolean;
//   d: number;

//   constructor() {
//     this.c = null;
//     this.d = null;
//   }
// }


interface X {
  a: number;
  b: string;
}
