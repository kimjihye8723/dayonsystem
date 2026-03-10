import axios from 'axios';

async function test() {
    try {
        const res = await axios.put('http://localhost:5001/api/basic-codes', {
            GROUP_CD: "TEST",
            CODE_CD: "T1",
            CODE_NM: "Updated Test Code",
            CODE_PROP1: "Val1",
            CODE_PROP2: "Val2",
            CODE_PROP3: "Val3",
            DESCRIPTION_TX: "Desc",
            DEFAULT_YN: "N",
            USE_YN: "Y",
            SYSTEM_YN: "N",
            RELATION_CD: "Rel",
            SORT_SEQ: 1,
            REMARK: "Remark"
        });
        console.log(res.data);
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
test();
