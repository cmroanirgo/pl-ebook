pl-ebook
===========

This utility program makes use of the command line of the [calibre ebook application](http://calibre-ebook.com/) and [pl-copyfind](https://github.com/cmroanirgo/pl-copyfind), a javascript library for detecting similarities between texts. The end result is that you can place ebooks of any supported format[^*] in one of two folders to cross compare them for similarities.

Note that DRM enabled titles will fail to work using this utility and neither calibre, nor this utility provide any direct mechanism to automatically remove DRM, nor will this policy change. 

The results of the comparison are written to an HTML file (report.html) for visual analysis.


[^*]: Anything that calibre can understand, can be used. This includes all Amazon formats (mobi, azw, etc), epub, pdf, etc, etc. 



Installation
----------------

1. Install [calibre](http://calibre-ebook.com/) 
2. download this package and place it in a folder somewhere (eg pl-ebook)
3. run `node update` from the command line in that folder. This will download all dependencies

This application assumes that calibre is installed to either `C:\Program Files (x86)\Calibre2\` (windows) or  `/Applications/calibre.app` (mac). If your installation appears somewhere else you'll need to either:

1. hack the code (at the top of index.js)
2. always specify the location of the [calibre command line tool (calibre-ebook)](https://manual.calibre-ebook.com/generated/en/ebook-convert.html) as a parameter. eg:

	
	node index.js "./path1" "./path2" "--calibre=c:\utils\ebook-convert"



The good news is that this is untested, and you may end up choosing the first option (hack the script) anyway.



Usage
----------

You will most likely wish to wrap this in a batch file (/shell script) for day to day use.

	node index.js "./path/to/source/files/with/ebooks" "./path/to/compare" [name_of_result.html]




Disclaimer
-----------

This project is supplied 'as is' is not likely to be actively supported. It was quickly knocked together for some friends.

The code is poorly designed and is highly procedural. In short, the code is not production worthy and certainly not worthy of a developer's attention. For that I apologise. 
