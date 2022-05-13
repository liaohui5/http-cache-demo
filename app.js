"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const app = express();
const port = 8888;

// 异步读取文件
function asyncReadFile(filePath) {
	return new Promise((resolve, reject) => {
		fs.readFile(path.resolve(filePath), (err, data) => {
			return err ? reject(err) : resolve(data);
		});
	});
}

// 异步获取文件的hash, 用sha1算法
function getFileHash(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash("sha1");
		const stream = fs.createReadStream(path.resolve(filePath));
		stream.on("error", (err) => reject(err));
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

// index.html: 不缓存, 但是会在这个文件中导入其他静态文件 test.css/test.js
app.get("/", async (_req, res) => {
	const htmlContents = await asyncReadFile("./assets/index.html");
	res.setHeader("Content-Type", "text/html");
	res.end(htmlContents);
});

/******************************** 强制缓存 *********************************
1. 在服务端返回资源的时候设置 Response Header 的 Cache-Control 字段, 就可以
2. 强制缓存的问题, 如果服务端文件改动了, 但是缓存过期时间没到, 不会更新成最新的文件
查看效果, 修改max-age的值, 并且改动 assets/test.cs, 查看效果

Cache-Control字段取值:
no-cache: 告诉浏览器不要使用缓存(但是浏览器还是会缓存,只是每次都去服务端获取最新的)
no-store: 告诉浏览器不要缓存(浏览器不会缓存文件, 每次去服务端获取)
max-age=10: 告诉浏览器缓存文件, 并且10秒后过期, 过期后去服务端获取新的
public: 所有客户端(代理服务器)都可以缓存
private: 只有客户端能缓存(代理服务器进制缓存)
其他字段参考: https://blog.csdn.net/TDCQZD/article/details/81950576
*/
app.get("/test.css", async (_req, res) => {
	console.log("[Request]: test.css");
	const cssContents = await asyncReadFile("./assets/test.css");
	res.setHeader("Content-Type", "text/css");
	res.setHeader("Cache-Control", "public,max-age=30");
	res.end(cssContents);
});

/******************************** 协商缓存 *********************************
使用 last-modified 和 if-modified-since(如果是缓存, 不需要重新发送请求)

1. 协商缓存优先级高于强制缓存
2. 获取文件最后修改时间,放到Response Header 的 last-modified 字段
3. 获取 Request Header 的 if-modified-since 字段和文件的修改时间
   对比看文件是否改动, 如果改动了, 最后修改时间肯定不一样(ctime),
   如果不一样才读取, 一样证明没改动, 那就直接告诉浏览器使用缓存就好
4. 如果要查看效果, 修改 assets/test.js 就可以
*/
app.get("/test.js", async (req, res) => {
	console.log("[Request]: test.js");
	// 获取文件最后修改时间(Wed, 11 May 2022 10:48:50 GMT)
	const stat = fs.statSync("./assets/test.js");
	const ctime = new Date(stat.ctime).toUTCString();
	res.setHeader("Content-Type", "text/javascript");
	res.setHeader("Last-Modified", ctime);

	const ifModefiedSince = req.headers["if-modified-since"];
	if (ifModefiedSince === ctime) {
		res.statusCode = 304;
		return res.end();
	}
	const jsContents = await asyncReadFile("./assets/test.js");
	res.end(jsContents);
});

/******************************** 协商缓存 *********************************
使用 Etag 和 if-none-match(会重新发送请求)
Etag 和 last-modified 本质上套路是一样的, 都是对比文件是否有变化然后决定使用缓存还是重新读取

1. 协商缓存优先级高于强制缓存
2. 获取文件的 hash 值,放到Response Header 的 Etag 字段
3. 获取 Request Header 的 if-none-match 字段和文件 hash 对比
   看文件是否改动, 如果改动了, hash 值肯定不一样, 如果不一样才读取资源
   一样证明没改动, 那就直接告诉浏览器使用缓存就好
4. 由于单独使用 Etag 会重新发送请求, 所以不能单独使用Etag来做缓存,
   需要配合 Last-Modified 或 Cache-Control, 或者3个一起设置
   因为协商缓存优先级比强制缓存高, 所以可以使用这种方式
*/
app.get("/cache_policy.jpeg", async (req, res) => {
	console.log("[Request]: cache_policy.jpeg");
	res.setHeader("Content-Type", "image/jpeg");

	const filePath = "./assets/cache_policy.jpeg";
	const fileHash = await getFileHash(filePath);
	const ifNoneMatch = req.headers["if-none-match"];
	// Cache-Control 和 Etag 一起用的意思就是: max-age: 10 会强制缓存 10s
	// 过期之后(10s后)才会发送请求,并且在请求头中携带 if-none-match 这个字段
	// 服务端会判断这个 if-none-match 如果改变了,就重新读取资源, 没有改变就直接
	// 告诉浏览器使用缓存中的就可以了
	res.setHeader("Etag", fileHash);
	res.setHeader("Cache-Control", "public, max-age=10");
	if (ifNoneMatch === fileHash) {
		res.statusCode = 304;
		res.end();
	} else {
		// 如果是第一次请求或者是文件改动之后
		const imgStream = fs.createReadStream(filePath);
		imgStream.pipe(res);
	}
});

app.listen(port, () => console.log(`server started on port ${port}`));
