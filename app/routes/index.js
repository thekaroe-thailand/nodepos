var express = require('express');
var router = express.Router();

const mysql2 = require('mysql2');
const mysql = mysql2.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'db_nodepos'
});

// สร้าง promisePool
const promisePool = mysql.promise();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});
router.get('/product', (req, res) => {
    mysql.query('SELECT * FROM tb_product', (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.render('product', { products: rs });
        }
    })
})
router.get('/productForm', (req, res) => {
    res.render('productForm', { data: {} });
})
router.post('/productForm', (req, res) => {
    var sql = 'INSERT INTO tb_product SET ?';
    var data = req.body;

    mysql.query(sql, data, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.redirect('product');
        }
    })
})
router.get('/productEdit/:id', (req, res) => {
    var sql = 'SELECT * FROM tb_product WHERE id = ?';
    var params = [req.params.id];

    mysql.query(sql, params, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.render('productForm', { data: rs[0] });
        }
    })
})
router.post('/productEdit/:id', (req, res) => {
    var sql = 'UPDATE tb_product SET barcode = ?, name = ?, price = ?, cost = ? WHERE id = ?';
    var params = [req.body.barcode, req.body.name, req.body.price, req.body.cost, req.params.id];

    mysql.query(sql, params, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.redirect('/product');
        }
    })
})
router.get('/productDelete/:id', (req, res) => {
    var sql = 'DELETE FROM tb_product WHERE id = ?';
    var params = [req.params.id];

    mysql.query(sql, params, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.redirect('/product');
        }
    })
})
router.get('/sale', async(req, res) => {
    const billSale = await getLastBill();
    const billSaleDetails = await getBillSaleDetail(billSale);

    var totalQty = 0;
    var totalPrice = 0;

    billSaleDetails.forEach(item => {
        totalQty += Number(item.qty);
        totalPrice += Number(item.qty * item.price);
    })

    res.render('sale', { product: {}, billSaleDetails: billSaleDetails, totalQty: totalQty, totalPrice: totalPrice });
})
router.post('/sale', (req, res) => {
    if (req.body.barcode != null) {
        var params = [req.body.barcode];
        var sql = 'SELECT * FROM tb_product WHERE barcode = ?';

        // เติม async เข้าไป
        mysql.query(sql, params, async(err, rs) => {
            if (err) {
                res.send(err);
            } else {
                var product = {};

                if (rs.length > 0) {
                    product = rs[0];
                }

                //
                // step 2 save to bill sale
                //
                var lastBill = await getLastBill();

                // เพิ่มส่วนนี้เข้าไป
                await insertToBillSaleDetail(lastBill, product);

                // แก้ไขจุดนี้
                res.redirect('sale');
            }
        })
    } else {
        res.render('sale', { product: {} });
    }
});

async function getLastBill() {
    var sql = "SELECT * FROM tb_bill_sale WHERE status = 'open'";
    const [rows, fields] = await promisePool.query(sql);

    if (rows.length == 0) {
        return insertAndGetLastBill();
    }

    return rows[0];
}

async function insertAndGetLastBill() {
    var sql = "INSERT INTO tb_bill_sale(bill_date, status) VALUES(NOW(), 'open')";
    const [rows, fields] = await promisePool.query(sql);

    return getLastBill();
}

async function insertToBillSaleDetail(billSale, product) {
    var billSaleDetail = await getItem(billSale, product);

    if (billSaleDetail.length == 0) {
        await insertNewItem(billSale, product);
    } else {
        await updateItem(billSale, product);
    }
}

async function insertNewItem(billSale, product) {
    console.log(billSale);
    var sql = "INSERT INTO tb_bill_sale_detail(product_id, bill_sale_id, price, cost, qty) VALUES(?, ?, ?, ?, ?)";
    var params = [product.id, billSale.id, product.price, product.cost, 1];
    await promisePool.query(sql, params);
}

async function updateItem(billSale, product) {
    var sql = "UPDATE tb_bill_sale_detail SET qty = qty + 1 WHERE bill_sale_id = ? AND product_id = ?";
    var params = [billSale.id, product.id];
    await promisePool.query(sql, params);
}

async function getItem(billSale, product) {
    var sql = 'SELECT * FROM tb_bill_sale_detail WHERE bill_sale_id = ? AND product_id = ?';
    var params = [billSale.id, product.id];

    const [rows, fields] = await promisePool.query(sql, params);

    return rows;
}

async function getBillSaleDetail(billSale) {
    var sql = `
        SELECT
            tb_bill_sale_detail.*,
            tb_product.barcode,
            tb_product.name
        FROM tb_bill_sale_detail
        LEFT JOIN tb_product ON tb_product.id = tb_bill_sale_detail.product_id
        WHERE bill_sale_id = ?
    `;
    var params = [billSale.id];
    const [rows, fields] = await promisePool.query(sql, params);

    return rows;
}

router.get('/saleDeleteItem/:id', (req, res) => {
    var sql = 'DELETE FROM tb_bill_sale_detail WHERE id = ?';
    var params = [req.params.id];

    mysql.query(sql, params, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.redirect('/sale');
        }
    })
})

router.get('/saleEditItem/:id', (req, res) => {
    var sql = 'SELECT * FROM tb_bill_sale_detail WHERE id = ?';
    var params = [req.params.id];

    mysql.query(sql, params, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.render('saleEditItem', { billSaleDetail: rs[0] });
        }
    })
})

router.post('/saleEditItem/:id', (req, res) => {
    var sql = 'UPDATE tb_bill_sale_detail SET qty = ? WHERE id = ?';
    var params = [req.body.qty, req.params.id];

    mysql.query(sql, params, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.redirect('/sale');
        }
    })
})

router.get('/saleEnd', async(req, res) => {
    var billSale = await getLastBill();
    var billSaleDetails = await getBillSaleDetail(billSale);

    var totalPrice = 0;

    billSaleDetails.forEach(item => {
        totalPrice += (item.qty * item.price);
    });

    res.render('saleEnd', { totalPrice: totalPrice });
})

router.post('/saleEnd', (req, res) => {
    if (req.body.returnPrice < 0) {
        res.send('เงินทอนไม่พอ');
    } else {
        var sql = "UPDATE tb_bill_sale SET status = 'close' WHERE status = 'open'";
        mysql.query(sql, (err, rs) => {
            if (err) {
                res.send(err);
            } else {
                res.redirect('billSale/' + req.body.inputPrice + '/' + req.body.returnPrice);
            }
        })
    }
})

router.get('/billSale/:inputPrice/:returnPrice', (req, res) => {
    var dayjs = require('dayjs');
    var sql = "SELECT * FROM tb_bill_sale WHERE status = 'close' ORDER BY id DESC LIMIT 1";

    mysql.query(sql, async(err, rs) => {
        if (err) {
            res.send(err);
        } else {
            if (rs.length > 0) {
                const billSaleDetails = await getBillSaleDetail(rs[0]);
                res.render('billSale', {
                    inputPrice: req.params.inputPrice,
                    returnPrice: req.params.returnPrice,
                    billSale: rs[0],
                    billSaleDetails: billSaleDetails,
                    dayjs: dayjs
                });
            }
        }
    })
})
router.get('/report', (req, res) => {
    var dayjs = require('dayjs');
    var sql = `
        SELECT
            tb_bill_sale_detail.cost,
            tb_bill_sale_detail.price,
            tb_bill_sale_detail.qty,
            tb_bill_sale_detail.bill_sale_id,
            tb_product.barcode,
            tb_product.name,
            tb_bill_sale.bill_date
        FROM tb_bill_sale_detail
        LEFT JOIN tb_product ON tb_product.id = tb_bill_sale_detail.product_id
        LEFT JOIN tb_bill_sale ON tb_bill_sale.id = tb_bill_sale_detail.bill_sale_id
        WHERE tb_bill_sale.status = 'close'
    `;

    mysql.query(sql, (err, rs) => {
        if (err) {
            res.send(err);
        } else {
            res.render('report', { billSaleDetails: rs, dayjs: dayjs });
        }
    })
})

module.exports = router;