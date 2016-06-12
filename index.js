/**
 * @license
 * Copyright (c) 2016 Craig Monro (kodespace.com)
 **/

 "use strict";

require('os');
var path = require('path');
const fs = require('fs');
require('es6-promise').polyfill(); // adds ES6 promises as native functions, without cruft
var argv = require('minimist')(process.argv.slice(2)); // program arguments

var copyfind = require("pl-copyfind");
var execFile = require('child_process').execFile;

// use preconfigured folder locations based on the current platform. (*liable to break*)
var isWin = /^win/.test(process.platform);
var calibre_folder = isWin ? 'C:\\Program Files (x86)\\Calibre2\\' : '/Applications/calibre.app/Contents/console.app/Contents/MacOS/';
var cmd = 'ebook-convert' + (isWin ? '.exe':''); // see https://manual.calibre-ebook.com/generated/en/ebook-convert.html

// helper functions
function log(str) { console.log(str); }
function loge(str, err) { console.error(`\x1b[31m**ERROR, ${str}: ${err}\x1b[0m`); }
function logw(str, err) { console.error(`\x1b[33m**WARNING, ${str}: ${err}\x1b[0m`); }

var options = {
	left_folder: './left', // folder that contains ebooks
	right_folder: './right',
	report_name: 'results.html',
	cache_folder: 'cache',
	convert_cmd: (calibre_folder+cmd),
	convert_args: ['--asciiize', '--unsmarten-punctuation' ] // --max-line-length
};


// funcs promis-ified:
function fs_access(_path, _perms) {
	var p = new Promise(function(resolve, reject) {
		fs.access(_path, _perms, (err) => {
			if (err)
				reject(err);
			else
				resolve(true);
		});
	});
	return p;
}
function fs_stat(_path) {
	var p = new Promise(function(resolve, reject) {
		fs.stat(_path, (err, stat) => {
			if (err)
				reject(err);
			else
				resolve(stat);
		});
	});
	return p;
}
function fs_readdir(_path) {
	var p = new Promise(function(resolve, reject) {
		fs.readdir(_path, (err, files) => {
			if (err) reject(err);
			else resolve(files);
		});
	});
	return p;
}

function cp_execFile(cmd, args) {
	var p = new Promise(function(resolve, reject) {
		execFile(cmd, args, function(error, stdout, stderr) {
			if (error) {
				reject(error);
			}
			else {
				var response = { stdout: stdout, stderr: stderr }
				resolve(response);
			}
		});
	});
	return p;
}



//

function showHelp() {
	console.log(
		"USAGE:\n" +
		"\tpl-ebook \"source folder\" \"test folder\" \"results.html\" [OPTIONS]\n" +
		"\n"+
		"WHERE:\n"+
		"\tsource  and test folders contain ebooks to be cross compared.\n" +
		"\tresults.html contains the results of cross comparison.\n" +
		"\t--calibre\tfull path to calibre's ebook-convert.\n" +
		"\t--cache  \tsub folder containing cached converted books. default is .cache'\n" +
		"");
	process.exit(-1);
}

function checkExePermissions(_path) {
	// checks that the given path is an exe (relative to current working directory)
	return fs_access(_path, fs.R_OK | fs.X_OK)
		.catch(function(err) {
			loge('Cannot open \"'+_path +'\" as an executable.', err);
			throw err;
		});	
}

function folderExists(_path) {
	// using promises, checks that the given path exists and is a folder (relative to current working directory)
	return fs_stat(_path)
		.then(function(stat) {
			if (!stat.isDirectory())
				throw new Error('"'+_path+'" is not a folder.')
			return true;
		})
		.catch(function(err) {
			loge('', err);
			throw err;
		});	
}

function convertBook(_src, _dst, _filenames, _text_paths) {
	//log("'"+_src+"'=>'"+_dst+"'...");

	// compare the src & dest stats. any errors will result in a conversion attempt, but perhaps we've already converted the book beforehand
	var p = fs_stat(_src)
			.then(function(_src_stat) { 
				if (!_src_stat.isFile()) {
					return false; // nothing to do, (ignore sub folders)
				}

	  			return fs_stat(_dst)
	  				.then(function(_dst_stat) {
	  					if (_dst_stat.mtime <= _src_stat.mtime) {
							log("Cached version of '"+_src+"' is invalid");
	  						throw new Error("cache is invalid for " + _src);
		  				}
	  					if (_dst_stat.size<1) {
							log("Cached version of '"+_src+"' is empty");
	  						throw new Error("invalid size of cached output for " + _src);
		  				}
		  				return true;
		  			})

			})
			.then(function(ok_to_use) { 
				if (ok_to_use) {
					log("Found cached version of '"+_src+"'");
					_filenames.push(path.basename(_src));
					_text_paths.push(_dst);
				}
				return ok_to_use;
			})
			.catch(function() {
				// can't use cached version. need to run converter:

				// ensure output folder exists
				try { 
					fs.mkdirSync(path.dirname(_dst));
				}
				catch(e) { }

				// run calibre now
				log("Converting '"+_src+"' to text...");
				var args = [_src,_dst].concat(options.convert_args);
				return cp_execFile(options.convert_cmd, args)
					.catch(function(error) {
						//  DRM titles end up here. maybe there's a way to workaround?
		  				loge("Can't convert '"+ _src+"' to '"+_dst+"'", error);
		  				return false;
					})
					.then(function(response) {
						if (!response) {
							logw("skipping '"+_src+"'", 'This is most likely due to DRM issues. Try using the DeDRM plugin (https://apprenticealf.wordpress.com/2012/09/10/calibre-plugins-the-simplest-option-for-removing-most-ebook-drm/) for calibre and manually import the book');
							return false; // from previous catch()
						}
			  			if (response.stderr.length>0) 
			  				loge("Error converting '"+_src+"'", response.stderr); // BUT DONT throw an error & allow continuation
			  			//log(stdout);

			  			// check that there's something in the output file
			  			return fs_stat(_dst)
			  				.then(function(stat) {
			  					if (stat.size>0) {
									_filenames.push(path.basename(_src));
									_text_paths.push(_dst);
				  					return true;
				  				}
				  				else {
				  					logw("Output is empty for '"+_dst+"'. Please check '"+_src+"'");
				  					return false; // didn't create output file!
				  				}
				  			})
				  			.catch(function(error) {
			  					logw("Could not create output for '"+_src+"'", error);
			  					return false;
			  				});
			  			});
				});


	return p;
}

function convertBooks(_path, _filenames, _text_paths) {
	return folderExists(_path).then( function() {
		// get each file in the folder
		return fs_readdir(_path).then(function(files) {
		
			// start an async sequence of file conversions (waits for one to finishing before starting next)
			var sequence = Promise.resolve();
			files.map(function(file) { // eg. // gazing into the eternal.epub
				var file_path = path.join(_path, file); // eg. /some/folder/gazing into the eternal.epub
				var out_path  = path.join(_path, options.cache_folder, path.basename(file, path.extname(file)) + ".txt"); // eg. /other/place/gazing into the eternal.txt
				if (!path.isAbsolute(_path)) {
					file_path = path.normalize(path.join(process.cwd(), file_path));
					out_path  = path.normalize(path.join(process.cwd(), out_path));
				}
				sequence = sequence.then(function() { 
					// wait for each book to convert until moving to the next
					return convertBook(file_path, out_path, _filenames, _text_paths); 
				});
			});
			return sequence.then(function() { 
				return true; // all finished
			});
		});
	});
}

function processOptions() {
	if (argv._.length<2)
		showHelp();
	
	options.left_folder = argv._[0];
	options.right_folder = argv._[1];
	if (argv.length>2)
		options.report_name = argv._[2];

	if (argv.cache)
		options.cache = argv.cache;
	if (argv.calibre)
		options.convert_cmd = argv.calibre;

	return checkExePermissions(options.convert_cmd);
}

function cleanupText(str) {
	return str.replace(/\r/g, '')
                //.replace(/\s+\n/g, '\n')
                .replace(/ {2,}/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .replace(/\t{2,}/g, '\t').trim();	
}

processOptions().then(function() {
	var left_filenames = [];
	var right_filenames = [];
	var left_textpaths = [];
	var right_textpaths = [];
	return convertBooks(options.left_folder, left_filenames, left_textpaths)
		.then(function() {
			
			return convertBooks(options.right_folder, right_filenames, right_textpaths)
				.catch(function(error){
					loge("unexpected error", error);
				})
				.then(function() {
					log("Finished conversions. Ready for comparisons");
					if (left_filenames.length<1)
						throw new Error("Did not find any files to compare against in '"+options.left_folder+"'");
					if (right_filenames.length<1)
						throw new Error("Did not find any files to compare against in '"+options.right_folder+"'");

					var copyFindOptions = { 
						PhraseLength:34
						, WordThreshold:100
						, bIgnoreCase: true
						, bIgnorePunctuation:true
						, MismatchTolerance: 6
						//, bSkipNonwords:true
						, bBuildReport: true

						};

					// load ALL the files into memory. yes, this can be large!
					log("Loading files into memory...");
					var left = [];
					for (var l=0; l<left_filenames.length; l++) {
						left.push(cleanupText(fs.readFileSync(left_textpaths[l], 'utf8')));
					}
					var right = [];
					for (var r=0; r<right_filenames.length; r++) {
						right.push(cleanupText(fs.readFileSync(right_textpaths[r], 'utf8')));
					}

					// copyfind...
					log("Beginning comparison of "+left_filenames.length+" files against "+right_filenames.length+" files...");

					copyfind(left, right, copyFindOptions, function(err, data) {
						if (err) 
							throw "Failed to compare: " + err.message;

						console.log("Comparison ran in " + data.executionTime/1000.0 + "s\n");

						// generate the report html file.
						var output = options.report_name;
						if (!path.isAbsolute(output))
							output = path.join(process.cwd(), output);

						var summary = [];
						for (var l=0; l<left_filenames.length; l++) {
							for (var r=0; r<right_filenames.length; r++) {
								var matches = data.matches[l][r];
								//log("match " + l + " " + r + ": ");
								//console.dir(matches);
								var numwords = 0;
								var nummatches = matches.length;
								matches.map(function(match) {
									numwords += match.textL.wordCount;
								})

								var str = nummatches==0 ? '<div class="summary">' :'<a href="#doc'+l+''+r+'L" class="summary">';

								str += '<div class="left">#'+l+". " + left_filenames[l] + '</div><span>vs.</span>'+
									'<div class="right">#'+r+". " + right_filenames[r] + '</div>' + 
									'<div class="stats">'+numwords+' Words in '+nummatches+' incidents</div>';
								str += nummatches==0 ? '</div>' :'</a>';
								summary.push(str);
							}
						}

						var html = "<!DOCTYPE html>\n" +
								"<html><!-- Generated by pl-ebook. See https://github.com/cmroanirgo/pl-copyfind/ -->\n<head><meta charset=\"UTF-8\">\n<style>\n"+
								"* { box-sizing: border-box; }\n" +
								"html,body { height:100%;font-family:sans-serif;}\n body { margin: 1em; }" +
								".summary { margin:1em 1em; border:1px solid #aaa; text-align:center; display:inline-block; padding:3em; text-decoration:none; }\n" +
								".summary span { color:#aaa; }\n" +
								".summary .stats { color:red; padding-top:0.6em; }\n" +
								"div.summary .stats { color:#0A0; }\n" +
								".doc { display:inline-block;width:49%;overflow:scroll;height:60%;max-height:800px;border:1px solid #aaa;padding:1em;} \n"+
								".doc>a[data-match]::before { content: \"# \" attr(data-match); border:1px solid #00a; background-color:#aaf; position:relative; top:-1em; font-size:0.6em; border-radius:4px; padding: 0.1em 1em; white-space: nowrap;}\n" +
								".doc>a { text-decoration:none; } .doc>a:hover { text-decoration:underline; } \n" +
								".match { color:#e33 }\n"+
								".match-partial { color:#007F00 }\n" +
								".match-removed { color:#333; background-color:#eee; font-size: 0.9em; font-style: italic;}\n" +
								".match-removed::before { content: \"...\"; padding:0 1em 0 0; }\n" +
								".match-removed::after { content: \"...\"; padding:0 0 0 1em; }\n" +
								" @media screen and (max-width: 700px) { .doc { display: block; width:90%;} }\n"+
								"</style>\n</head><body>\n<h1>Comparison results</h1>\n" +
								"<p>Files in <code>" + options.left_folder + "</code>:\n<ol start=0><li>" + 
									left_filenames.join("</li><li>") + 
								"</li></ol></p>\n" + 
								"<p>Files in <code>" + options.right_folder + "</code>:\n<ol start=0><li>" + 
									right_filenames.join("</li><li>") + 
								"</li></ol></p>\n" + 
								"<p>Date: " + (new Date()).toUTCString() + "</p>\n" + 
								"\n<h2>Summary</h2>\n"+
								 summary.join("\n") +
								"\n<h1>Detailed Comparison</h1>\n"+
								data.html + "\n"+
								"\n<h2>Options Used</h2>\n"+
								"<p>" + JSON.stringify(copyFindOptions).split(",").join(",<br>\n").split("\"").join("")+"</p>"
								"\n</body></html>";


						fs.writeFileSync(output, html);
						log("Report is available in '" +output+ "'");
					});
				})
			.catch(function(error) {
				loge("", error);
			})
		})
	});




