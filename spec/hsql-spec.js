'use strict';
var jt400 = require('../lib/jt400').useInMemoryDb(),
	JSONStream = require('JSONStream'),
	q = require('q');

describe('hsql in memory', function() {

	beforeEach(function(done) {
		jt400.update('create table testtbl (ID DECIMAL(15, 0) GENERATED BY DEFAULT AS IDENTITY(START WITH 1234567891234), NAME VARCHAR(300), START DATE, STAMP TIMESTAMP, PRIMARY KEY(ID))')
			.then(function() {
				return jt400.update('insert into testtbl (NAME) values(\'Foo bar baz\')');
			})
			.then(function() {
				done();
			})
			.fail(done);
	});

	afterEach(function(done) {
		jt400.update('drop table testtbl')
			.then(function() {
				done();
			})
			.fail(done);
	});

	it('should select form testtbl', function(done) {
		jt400.query('select * from testtbl')
			.then(function(res) {
				expect(res.length).toBe(1);
				done();
			})
			.fail(done);
	});

	it('should use column alias when selecting', function () {
		jt400.query('select ID, NAME MYNAME from testtbl')
			.then(function (res) {
				expect(res[0].MYNAME).toBeDefined();
			});
	});

	it('should insert and return id', function(done) {
		jt400.insertAndGetId('insert into testtbl (NAME) values(?)', ['foo'])
			.then(function(res) {
				expect(res).toBe(1234567891235);
				done();
			})
			.fail(done);
	});

	it('should insert list', function(done) {
		jt400.insertList('testtbl', 'ID', [{
			NAME: 'foo'
		}, {
			NAME: 'bar'
		}])
			.then(function(res) {
				expect(res).toEqual([1234567891235, 1234567891236]);
				return jt400.query('select * from testtbl');
			})
			.then(function(res) {
				expect(res.length).toBe(3);
				done();
			})
			.fail(done);
	});

	it('should mock pgm call', function(done) {
		var callFoo = jt400.pgm('foo', {
			name: 'bar',
			size: 10
		}, {
			name: 'baz',
			size: 9,
			decimals: 2
		}),
			input = {
				bar: 'a',
				baz: 10
			};
		callFoo(input).then(function(res) {
			expect(res).toEqual(input);
			done();
		})
			.fail(done);
	});

	it('should insert date and timestamp', function (done) {
		jt400.insertList('testtbl', 'ID', [{
			START: new Date().toISOString().substr(0, 10),
			STAMP: new Date()
		}]).then(function () {
			done();
		})
			.fail(done);
	});

	it('executeAsStream should return results as stream of rows, each row being an array and emit metadata event', function(done) {
		var stream = jt400.executeAsStream({sql: 'select * from testtbl', metadata: true}),
			rows = [],
			metadata;
		stream.on('data', function (data) {
			if(!metadata) {
				metadata = data;
			} else {
				rows.push(data);
			}
		});
		stream.on('end', function () {
			expect(metadata).toEqual([{
					name: 'ID',
					typeName: 'DECIMAL',
					precision: 15,
					scale: 0
				}, {
					name: 'NAME',
					typeName: 'VARCHAR',
					precision: 300,
					scale: 0
				}, {
					name: 'START',
					typeName: 'DATE',
					precision: 10,
					scale: 0
				}, {
					name: 'STAMP',
					typeName: 'TIMESTAMP',
					precision: 26,
					scale: 6
				}]
			);
			expect(rows).toEqual([
				['1234567891234', 'Foo bar baz', null, null]
			]);
			done();
		});
		stream.on('error', done);
	});

	it('should return stream', function (done) {
		var i=1, data = [];
		while(i<110) {
			data.push(i++);
		}
		data.reduce(function (memo, item) {
			return memo.then(function(){
				return jt400.update('insert into testtbl (NAME) values(?)', ['n'+item]);
			});
		}, q()).then(function () {
			var res = [];
			var stream = jt400.executeAsStream('select NAME from testtbl order by ID');
			stream.on('data', function (row) {
				res.push(row);
			});
			stream.on('end', function () {
				expect(res.length).toBe(110);
				res.forEach(function (row, index) {
					if(index>0) {
						expect(row[0]).toEqual('n'+index);
					}
				});
				done();
			});
			stream.on('error', done);
		})
		.fail(done);
	});

	it('should still return metadata when result is cero rows', function (done) {
		var stream = jt400.executeAsStream({sql: 'select * from testtbl where ID=-1', metadata: true}),
			rows = [],
			metadata;
		stream.on('data', function (data) {
			if(!metadata){
				metadata = data;
			} else {
				rows.push(data);
			}
		});
		stream.on('end', function () {
			expect(metadata).toBeDefined();
			expect(rows.length).toEqual(0);
			done();
		});
		stream.on('error', done);
	});

	it('should return buffer stream when not in objectmode', function (done) {
		var stream = jt400.executeAsStream({sql: 'select * from testtbl', metadata: false, objectMode: false}),
			data = '',
			_this = this;
		stream.on('data', function (buffer) {
			data += buffer;
		});
		stream.on('end', function () {
			expect(data).toBe('[["1234567891234","Foo bar baz",null,null]]');
			done();
		});
		stream.on('error', done);
	});

	it('should close stream', function (done) {
		var i=1, data = [], _this = this;
		while(i<40) {
			data.push(i++);
		}
		q.all(data.map(function (item) {
			return jt400.update('insert into testtbl (NAME) values(?)', ['n'+item]);
		})).then(function () {
			var res = [];
			var stream = jt400.executeAsStream({sql: 'select NAME from testtbl', bufferSize: 10});
			stream.on('data', function (row) {
				res.push(row);
				if(res.length >= 10) {
					stream.close();
				}
			});
			stream.on('end', function () {
				expect(res.length).toBeLessThan(21);
				done();
			});
			stream.on('error', done);
		})
		.fail(done);
	});

	it('should return table metadata as stream', function (done) {
		var stream = jt400.getTablesAsStream({schema: 'PUBLIC'}),
			schema = [];
		stream.on('data', function (data) {
			schema.push(data);
		});
		stream.on('end', function () {
			expect(schema).toEqual([{
				schema: 'PUBLIC',
				table: 'TESTTBL',
				remarks: ''
			}]);
			done();
		});
		stream.on('error', done);
	});

	it('should return columns', function (done) {
		jt400.getColumns({schema: 'PUBLIC', table: 'TESTTBL'})
		.then(function (res) {
			expect(res).toEqual([{
				name: 'ID',
				typeName: 'DECIMAL',
				precision: 15,
				scale: 0
			}, {
				name: 'NAME',
				typeName: 'VARCHAR',
				precision: 300,
				scale: 0
			}, {
				name: 'START',
				typeName: 'DATE',
				precision: 10,
				scale: 0
			}, {
				name: 'STAMP',
				typeName: 'TIMESTAMP',
				precision: 26,
				scale: 0
			}]);
			done();
		}).fail(done);
	});

	describe('transaction', function () {
		it('should commit', function (done) {
			var rowId;
			jt400.transaction(function (transaction) {
				return transaction.insertAndGetId("insert into testtbl (NAME) values('Transaction 1')")
				.then(function (res) {
					rowId = res;
					return transaction.update("update testtbl set NAME='Transaction 2' where id=?", [rowId]);
				});
			})
			.then(function () {
				return jt400.query('select NAME from testtbl where id=?', [rowId]);
			})
			.then(function (res) {
				expect(res[0].NAME).toEqual('Transaction 2');
				done();
			})
			.fail(done);

		});

		it('should rollback', function (done) {
			var fakeError = new Error('fake error'), rowId;
			jt400.transaction(function (transaction) {
				return transaction.insertAndGetId("insert into testtbl (NAME) values('Transaction 1')")
				.then(function (res) {
					rowId = res;
					throw fakeError;
				});
			})
			.fail(function (err) {
				expect(err).toBe(fakeError);
			})
			.then(function () {
				return jt400.query('select NAME from testtbl where id=?', [rowId]);
			})
			.then(function (res) {
				expect(res.length).toBe(0);
				done();
			})
			.fail(done);
		});
	});
});