/// <reference path="../../typings/node/node.d.ts" />

'use strict';

import * as fs from 'fs';

// This is heavily based on the design of cat.c from sbase:
// http://git.suckless.org/sbase/tree/cat.c .  Seemingly more
// traditional 'node' way to do things would be to read the entire
// file contents and then dump them, but that doesn't work correctly
// for stdin where cat can read chunks at a time (think typing 'echo'
// and hitting enter) until it receives EOF.

// Recursively read each input and write it to the specified output,
// only moving onto the next input when EOF is reached.  Each file is
// a node stream object - which means that we consume it by adding 2
// event listeners, the first for when there is data available, and
// secondly for when we've reached EOF.
function wc(inputs: NodeJS.ReadableStream[], output: NodeJS.WritableStream, opts: Opts, code: number): void {
	'use strict';

	if (!inputs || !inputs.length) {
		process.exit(code);
		return;
	}

	let current = inputs[0];
	inputs = inputs.slice(1);

	let w = 0;
	let c = 0;
	let l = 0;

	if (!current) {
		// use setTimeout to avoid a deep stack as well as
		// cooperatively yield
		setTimeout(wc, 0, inputs, output, opts, code);
		return;
	}

	current.on('readable', function(): void {
		let buf = current.read();
		if (buf !== null) {
			c += buf.length;
			l += (buf.toString().match(/\n/g) || []).length;
			w += (buf.toString().match(/\S+/g) || []).length;
		}
	});

	current.on('end', function(): void {
		// use setTimeout to avoid a deep stack as well as
		// cooperatively yield
		if (opts.outputLine)
			output.write(l + "\t");
		if (opts.outputWord)
			output.write(w + "\t");
		if (opts.outputChar)
			output.write(c + "\t");
		output.write("\n");
		setTimeout(wc, 0, inputs, output, opts, code);
	});
}

interface Opts {
	outputLine: boolean;
	outputWord: boolean;
	outputChar: boolean;
}

function main(): void {
	'use strict';

	let argv = process.argv;
	let pathToNode = argv[0];
	let pathToScript = argv[1];
	let args = argv.slice(2);

	// exit code to use - if we fail to open an input file it gets
	// set to 1 below.
	let code = 0;
	let defOpts = {outputLine: true, outputWord: true, outputChar: true};
	if (!args.length) {
		// no args?  just wc stdin to stdout
		setTimeout(wc, 0, [process.stdin], process.stdout, defOpts, code);
	} else {
		// note: wc will not take "-" as stdin
		let opts: Opts;
		if (args[0][0] !== '-') {
			opts = defOpts;
		}
		else {
			opts = {outputLine: false, outputWord: false, outputChar: false};
			while (args[0][0] === '-') {
				switch (args[0].slice(1)) {
				case "l":
					opts.outputLine = true;
					break;
				case "w":
					opts.outputWord = true;
					break;
				// in *nix -m is for character and -c is for bytes; project description has -c as char and ommits byte count.
				case "c":
					opts.outputChar = true;
					break;
					//default:
					// could throw an error here
				}
				args.shift();
			}
		}
		let files: NodeJS.ReadableStream[] = [];
		let opened = 0;
		// use map instead of a for loop so that we easily get
		// the tuple of (path, i) on each iteration.
		args.map(function(path, i): void {
			if (path === '-') {
				files[i] = process.stdin;
				// if we've opened all of the files, pipe them to
				// stdout.
				if (++opened === args.length)
					setTimeout(wc, 0, files, process.stdout, opts, code);
				return;
			}
			fs.open(path, 'r', function(err: any, fd: any): void {
				if (err) {
					// if we couldn't open the
					// specified file we should
					// print a message but not
					// exit early - we need to
					// process as many inputs as
					// we can.
					files[i] = null;
					code = 1;
					process.stderr.write(pathToScript + ': ' + err.message + '\n');
				} else {
					files[i] = fs.createReadStream(path, {fd: fd});
				}
				// if we've opened all of the files,
				// pipe them to stdout.
				if (++opened === args.length)
					setTimeout(wc, 0, files, process.stdout, opts, code);
			});
		});
	}
}

main();
