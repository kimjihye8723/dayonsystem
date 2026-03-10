import axios from 'axios';

async function testFetchBoards() {
    try {
        const res = await axios.get('http://localhost:5001/api/boards', {
            params: {
                startDate: '20230101',
                endDate: '20280101',
                title: '',
                boardSec: '02'
            }
        });
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("Error fetching", e.response ? e.response.data : e.message);
    }
}
testFetchBoards();
